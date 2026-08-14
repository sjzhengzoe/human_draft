import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import COS from "cos-nodejs-sdk-v5";

import { config } from "../config.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const applyMigration = process.argv.includes("--apply");
const backupArgument = process.argv.find((value) => value.startsWith("--backup="));
const backupRoot = resolve(
  backupArgument?.slice("--backup=".length) ||
    resolve(projectRoot, "..", `human-draft-supabase-images-backup-${new Date().toISOString().slice(0, 10)}`),
);
const credentialsPath = process.env.COS_CREDENTIALS_CSV || "";
const manifestPath = resolve(backupRoot, "manifest.json");
const objectRoot = resolve(backupRoot, "objects");
const bucketNames = [
  config.dishBucket,
  config.activityBucket,
  config.mediaCoverBucket,
  config.wardrobeBucket,
  config.keyMomentBucket,
  config.avatarBucket,
];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

async function loadCosCredentials() {
  if (config.cosSecretId && config.cosSecretKey) {
    return { SecretId: config.cosSecretId, SecretKey: config.cosSecretKey };
  }
  if (!credentialsPath) throw new Error("缺少 COS_CREDENTIALS_CSV。" );
  const csv = (await readFile(credentialsPath, "utf8")).replace(/^\uFEFF/, "").trimEnd();
  const [headerLine, dataLine] = csv.split(/\r?\n/);
  if (!headerLine || !dataLine) throw new Error("COS 密钥 CSV 格式无效。" );
  const headers = parseCsvLine(headerLine);
  const values = parseCsvLine(dataLine);
  const row = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  if (!row.SecretId || !row.SecretKey) throw new Error("COS 密钥 CSV 缺少 SecretId 或 SecretKey。" );
  return { SecretId: row.SecretId, SecretKey: row.SecretKey };
}

function callCos(cos, method, parameters) {
  return new Promise((resolveCall, rejectCall) => {
    cos[method](parameters, (error, data) => {
      if (error) rejectCall(error);
      else resolveCall(data || {});
    });
  });
}

async function retry(operation, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 800));
      }
    }
  }
  throw lastError;
}

async function runPool(items, concurrency, worker, stage) {
  let nextIndex = 0;
  let completed = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
      completed += 1;
      if (completed % 25 === 0 || completed === items.length) {
        console.log(JSON.stringify({ stage, completed, total: items.length }));
      }
    }
  });
  await Promise.all(workers);
}

function safeObjectPath(item) {
  const root = resolve(objectRoot, item.bucketId);
  const target = resolve(root, item.path);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error("Storage 对象路径越过备份目录。" );
  }
  return target;
}

async function loadInventory(supabase) {
  const { data, error } = await supabase.rpc("private_image_storage_inventory", {
    p_bucket_ids: bucketNames,
  });
  if (error) throw error;
  return (data || [])
    .map((item) => ({
      bucketId: item.bucket_id,
      path: item.object_name,
      size: Number(item.object_size || 0),
      contentType: item.mime_type || "application/octet-stream",
      sha256: "",
      backedUp: false,
      uploaded: false,
      verified: false,
    }))
    .sort((left, right) =>
      left.bucketId.localeCompare(right.bucketId) || left.path.localeCompare(right.path)
    );
}

function totals(items) {
  return {
    objects: items.length,
    bytes: items.reduce((sum, item) => sum + item.size, 0),
    buckets: Object.fromEntries(bucketNames.map((bucketId) => {
      const bucketItems = items.filter((item) => item.bucketId === bucketId);
      return [bucketId, {
        objects: bucketItems.length,
        bytes: bucketItems.reduce((sum, item) => sum + item.size, 0),
      }];
    })),
  };
}

async function saveManifest(manifest) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(manifestPath, 0o600);
}

async function backupObjects(supabase, manifest) {
  await runPool(manifest.items, 5, async (item) => {
    const localPath = safeObjectPath(item);
    await mkdir(dirname(localPath), { recursive: true, mode: 0o700 });
    let buffer;
    try {
      const existing = await readFile(localPath);
      if (existing.length === item.size) buffer = existing;
    } catch (_error) {
      buffer = null;
    }
    if (!buffer) {
      buffer = await retry(async () => {
        const { data, error } = await supabase.storage.from(item.bucketId).download(item.path);
        if (error || !data) throw error || new Error("Supabase Storage 下载结果为空。" );
        return Buffer.from(await data.arrayBuffer());
      });
      if (item.size && buffer.length !== item.size) throw new Error("Supabase 备份文件大小不一致。" );
      await writeFile(localPath, buffer, { mode: 0o600 });
    }
    item.size = buffer.length;
    item.sha256 = sha256(buffer);
    item.backedUp = true;
  }, "backup");
  manifest.status = "backed-up";
  await saveManifest(manifest);
}

function cosKey(item) {
  return `${item.bucketId}/${item.path.replace(/^\/+/, "")}`;
}

async function uploadObjects(cos, manifest) {
  await runPool(manifest.items, 4, async (item) => {
    const buffer = await readFile(safeObjectPath(item));
    if (buffer.length !== item.size || sha256(buffer) !== item.sha256) {
      throw new Error("本地备份校验失败，已停止上传。" );
    }
    await retry(() => callCos(cos, "putObject", {
      Bucket: config.cosBucket,
      Region: config.cosRegion,
      Key: cosKey(item),
      Body: buffer,
      ContentLength: buffer.length,
      ContentType: item.contentType,
      CacheControl: "3600",
      StorageClass: "STANDARD",
    }));
    item.uploaded = true;
  }, "upload");
  manifest.status = "uploaded";
  await saveManifest(manifest);
}

async function verifyObjects(cos, manifest) {
  await runPool(manifest.items, 4, async (item) => {
    const data = await retry(() => callCos(cos, "getObject", {
      Bucket: config.cosBucket,
      Region: config.cosRegion,
      Key: cosKey(item),
    }));
    const buffer = Buffer.isBuffer(data.Body) ? data.Body : Buffer.from(data.Body || "");
    if (buffer.length !== item.size || sha256(buffer) !== item.sha256) {
      throw new Error("COS 对象校验失败。" );
    }
    item.verified = true;
  }, "verify");
  manifest.status = "complete";
  manifest.completedAt = new Date().toISOString();
  await saveManifest(manifest);
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("缺少 Supabase 服务端配置。" );
  }
  if (applyMigration && (!config.cosBucket || !config.cosRegion)) {
    throw new Error("迁移时必须设置 COS_BUCKET 和 COS_REGION。" );
  }
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  await chmod(backupRoot, 0o700);
  const supabase = getSupabaseAdmin();
  const items = await loadInventory(supabase);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    status: "inventory",
    source: "supabase-storage",
    destination: applyMigration ? "tencent-cos" : null,
    backupRoot,
    cosBucket: applyMigration ? config.cosBucket : null,
    cosRegion: applyMigration ? config.cosRegion : null,
    totals: totals(items),
    items,
  };
  console.log(JSON.stringify({ stage: "inventory", backupRoot, ...manifest.totals }));
  await saveManifest(manifest);
  await backupObjects(supabase, manifest);
  if (!applyMigration) {
    console.log(JSON.stringify({ stage: "backup-complete", backupRoot, ...manifest.totals }));
    return;
  }
  const credentials = await loadCosCredentials();
  const cos = new COS(credentials);
  await uploadObjects(cos, manifest);
  await verifyObjects(cos, manifest);
  const manifestStats = await stat(manifestPath);
  console.log(JSON.stringify({
    stage: "complete",
    backupRoot,
    manifestBytes: manifestStats.size,
    ...manifest.totals,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({
    stage: "failed",
    message: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
});

import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { config } from "../config.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const TARGET_BUCKETS = [
  config.dishBucket,
  config.activityBucket,
  config.mediaCoverBucket,
];
const CACHE_CONTROL = "3600";
const APPLY = process.argv.includes("--apply");
const MANIFEST_RPC = "private_image_storage_inventory";
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyBucket = onlyArgument ? onlyArgument.slice("--only=".length) : "";

function hash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry(operation, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 750);
    }
  }
  throw lastError;
}

async function runPool(items, concurrency, worker) {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function loadManifest(supabase) {
  const { data, error } = await supabase.rpc(MANIFEST_RPC, {
    p_bucket_ids: TARGET_BUCKETS,
  });
  if (error) throw error;
  return (data || [])
    .map((item) => ({
      bucketId: item.bucket_id,
      path: item.object_name,
      size: Number(item.object_size || 0),
      contentType: item.mime_type || "application/octet-stream",
    }));
}

function summary(items) {
  return {
    count: items.length,
    bytes: items.reduce((total, item) => total + item.size, 0),
  };
}

async function downloadBucket(supabase, bucketId, items, backupRoot) {
  const bucket = supabase.storage.from(bucketId);
  await runPool(items, 5, async (item, index) => {
    const localName = `${String(index).padStart(6, "0")}.bin`;
    const buffer = await retry(async () => {
      const { data, error } = await bucket.download(item.path);
      if (error || !data) throw error || new Error("Storage download returned no data");
      return Buffer.from(await data.arrayBuffer());
    });
    if (item.size && buffer.length !== item.size) {
      throw new Error(`Backup size mismatch in ${bucketId} at item ${index}`);
    }
    item.localName = localName;
    item.size = buffer.length;
    item.sha256 = hash(buffer);
    await writeFile(join(backupRoot, localName), buffer, { flag: "wx" });
  });
}

async function restoreBucket(supabase, bucketId, items, backupRoot) {
  const bucket = supabase.storage.from(bucketId);
  await runPool(items, 4, async (item, index) => {
    await retry(async () => {
      const buffer = await readFile(join(backupRoot, item.localName));
      if (buffer.length !== item.size || hash(buffer) !== item.sha256) {
        throw new Error(`Local backup verification failed in ${bucketId} at item ${index}`);
      }
      const { error } = await bucket.upload(item.path, buffer, {
        cacheControl: CACHE_CONTROL,
        contentType: item.contentType,
        upsert: false,
      });
      if (error) throw error;
    });
  });
}

async function rebuildBucket(supabase, bucketId, allItems, backupRoot) {
  const items = allItems.filter((item) => item.bucketId === bucketId);
  const before = summary(items);
  const bucketBackupRoot = join(backupRoot, bucketId);
  await mkdir(bucketBackupRoot, { recursive: false });
  const { data: bucketConfig, error: bucketError } = await supabase.storage.getBucket(bucketId);
  if (bucketError || !bucketConfig) throw bucketError || new Error(`Bucket ${bucketId} missing`);
  await writeFile(
    join(bucketBackupRoot, "manifest.json"),
    `${JSON.stringify({ bucketId, bucketConfig, items }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600, flag: "wx" },
  );

  console.log(JSON.stringify({ stage: "backup-start", bucketId, ...before }));
  await downloadBucket(supabase, bucketId, items, bucketBackupRoot);
  await writeFile(
    join(bucketBackupRoot, "manifest.json"),
    `${JSON.stringify({ bucketId, bucketConfig, items }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(JSON.stringify({ stage: "backup-complete", bucketId, ...before }));

  const bucket = supabase.storage.from(bucketId);
  for (let index = 0; index < items.length; index += 1000) {
    const { error: removeError } = await bucket.remove(
      items.slice(index, index + 1000).map((item) => item.path),
    );
    if (removeError) throw removeError;
  }
  const afterRemoveManifest = await loadManifest(supabase);
  const remaining = afterRemoveManifest.filter((item) => item.bucketId === bucketId);
  if (remaining.length !== 0) {
    throw new Error(`Bucket ${bucketId} still contains ${remaining.length} objects after removal`);
  }
  const { error: deleteError } = await supabase.storage.deleteBucket(bucketId);
  if (deleteError) throw deleteError;
  const { error: createError } = await supabase.storage.createBucket(bucketId, {
    allowedMimeTypes: bucketConfig.allowed_mime_types || undefined,
    fileSizeLimit: bucketConfig.file_size_limit || undefined,
    public: false,
  });
  if (createError) throw createError;

  try {
    await restoreBucket(supabase, bucketId, items, bucketBackupRoot);
  } catch (error) {
    console.error(JSON.stringify({
      stage: "restore-failed",
      bucketId,
      backupRoot,
      message: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }

  const restoredManifest = await loadManifest(supabase);
  const after = summary(restoredManifest.filter((item) => item.bucketId === bucketId));
  if (after.count !== before.count || after.bytes !== before.bytes) {
    throw new Error(
      `Restored inventory mismatch for ${bucketId}: ${JSON.stringify({ before, after, backupRoot })}`,
    );
  }
  const sample = items[0];
  if (sample) {
    const publicUrl = supabase.storage.from(bucketId).getPublicUrl(sample.path).data.publicUrl;
    const publicResponse = await fetch(publicUrl, { cache: "no-store" });
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucketId)
      .createSignedUrl(sample.path, 60);
    if (signedError || !signed?.signedUrl) throw signedError || new Error("Signed URL missing");
    const signedResponse = await fetch(signed.signedUrl, { cache: "no-store" });
    if (publicResponse.status < 400 || !signedResponse.ok) {
      throw new Error(
        `Access verification failed for ${bucketId}: public=${publicResponse.status}, signed=${signedResponse.status}`,
      );
    }
  }
  console.log(JSON.stringify({ stage: "verified", bucketId, ...after }));
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  }
  const supabase = getSupabaseAdmin();
  const manifest = await loadManifest(supabase);
  const selectedBuckets = onlyBucket
    ? TARGET_BUCKETS.filter((bucketId) => bucketId === onlyBucket)
    : TARGET_BUCKETS;
  if (selectedBuckets.length === 0) throw new Error(`Unknown bucket: ${onlyBucket}`);
  const inventory = Object.fromEntries(
    selectedBuckets.map((bucketId) => [
      bucketId,
      summary(manifest.filter((item) => item.bucketId === bucketId)),
    ]),
  );
  console.log(JSON.stringify({ stage: APPLY ? "apply" : "dry-run", inventory }));
  if (!APPLY) return;

  const backupRoot = await mkdtemp(join(tmpdir(), "human-draft-private-images-"));
  try {
    for (const bucketId of selectedBuckets) {
      await rebuildBucket(supabase, bucketId, manifest, backupRoot);
    }
    await rm(backupRoot, { recursive: true, force: true });
    console.log(JSON.stringify({ stage: "complete" }));
  } catch (error) {
    console.error(JSON.stringify({ stage: "migration-failed", backupRoot }));
    throw error;
  }
}

await main();

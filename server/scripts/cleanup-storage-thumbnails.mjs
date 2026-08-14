import { createHash } from "node:crypto";
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.mjs";
import { optimizedThumbnailPath } from "../lib/image-processing.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const applyChanges = process.argv.includes("--apply");
const manifestArgument = process.argv.find((value) => value.startsWith("--manifest="));
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const manifestPath = resolve(
  manifestArgument?.slice("--manifest=".length) ||
    resolve(projectRoot, "..", "private-image-migrations", `thumbnail-cleanup-${runId}.json`),
);

const sources = [
  { table: "dishes", bucket: config.dishBucket, image: "image_path", thumbnail: "thumbnail_path" },
  { table: "menu_places", bucket: config.dishBucket, image: "image_path", thumbnail: "thumbnail_path" },
  { table: "activity_items", bucket: config.activityBucket, image: "image_path", thumbnail: "thumbnail_path" },
  { table: "wardrobe_items", bucket: config.wardrobeBucket, image: "image_path", thumbnail: "thumbnail_path" },
  { table: "key_moments", bucket: config.keyMomentBucket, image: "image_path", thumbnail: "thumbnail_path" },
];

function mediaStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  if (!text.includes("://")) return text.replace(/^\/+/, "");
  try {
    const pathname = decodeURIComponent(new URL(text).pathname);
    for (const marker of [
      `/storage/v1/object/public/${config.mediaCoverBucket}/`,
      `/storage/v1/object/sign/${config.mediaCoverBucket}/`,
    ]) {
      const index = pathname.lastIndexOf(marker);
      if (index >= 0) return pathname.slice(index + marker.length);
    }
  } catch (_error) {
    return "";
  }
  return "";
}

async function readAll(supabase, table, columns) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + 499);
    if (error) throw new Error(`${table}：${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

async function downloadOptional(supabase, bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function saveManifest(manifest) {
  await mkdir(dirname(manifestPath), { recursive: true, mode: 0o700 });
  await chmod(dirname(manifestPath), 0o700);
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, manifestPath);
}

async function buildCleanupPlan(supabase) {
  const references = new Set();
  const originals = [];
  for (const source of sources) {
    const rows = await readAll(
      supabase,
      source.table,
      `${source.image},${source.thumbnail}`,
    );
    for (const row of rows) {
      if (row[source.image]) {
        references.add(`${source.bucket}\u0000${row[source.image]}`);
        originals.push({ bucket: source.bucket, path: row[source.image] });
      }
      if (row[source.thumbnail]) {
        references.add(`${source.bucket}\u0000${row[source.thumbnail]}`);
      }
    }
  }

  const [entries, seasons, schedule] = await Promise.all([
    readAll(supabase, "media_entries", "cover_url"),
    readAll(supabase, "media_seasons", "cover_url"),
    readAll(supabase, "menu_schedule_items", "snapshot_image_path,snapshot_place_image_path"),
  ]);
  for (const row of [...entries, ...seasons]) {
    const path = mediaStoragePath(row.cover_url);
    if (!path) continue;
    references.add(`${config.mediaCoverBucket}\u0000${path}`);
    originals.push({ bucket: config.mediaCoverBucket, path });
  }
  for (const row of schedule) {
    for (const path of [row.snapshot_image_path, row.snapshot_place_image_path]) {
      if (path) references.add(`${config.dishBucket}\u0000${path}`);
    }
  }

  const candidates = new Map();
  for (const original of originals) {
    const path = optimizedThumbnailPath(original.path);
    if (path) candidates.set(`${original.bucket}\u0000${path}`, { bucket: original.bucket, path });
  }

  const files = [];
  for (const candidate of candidates.values()) {
    if (references.has(`${candidate.bucket}\u0000${candidate.path}`)) {
      throw new Error("仍有数据库记录引用候选缩略图，已停止清理。");
    }
    const buffer = await downloadOptional(supabase, candidate.bucket, candidate.path);
    if (!buffer) continue;
    files.push({
      ...candidate,
      bytes: buffer.length,
      sha256: createHash("sha256").update(buffer).digest("hex"),
      status: "planned",
    });
  }
  return files;
}

async function main() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) throw new Error("缺少 Supabase 服务端配置。");
  const supabase = getSupabaseAdmin();
  const files = await buildCleanupPlan(supabase);
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  console.log(`发现 ${files.length} 个无引用派生缩略图，共 ${(bytes / 1024 / 1024).toFixed(2)} MiB。`);
  if (!applyChanges || !files.length) {
    console.log("当前为只读预演，没有删除文件。");
    return;
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    status: "planned",
    originalsRetained: true,
    derivativesRecoverableFromOriginals: true,
    files,
    totals: { files: files.length, bytes },
  };
  await saveManifest(manifest);
  for (let index = 0; index < files.length; index += 100) {
    const batch = files.slice(index, index + 100);
    const groups = Map.groupBy(batch, (file) => file.bucket);
    for (const [bucket, group] of groups) {
      const { error } = await supabase.storage.from(bucket).remove(group.map((file) => file.path));
      if (error) throw new Error(`删除派生缩略图失败：${error.message}`);
      group.forEach((file) => { file.status = "deleted"; });
    }
    await saveManifest(manifest);
  }
  for (const file of files) {
    if (await downloadOptional(supabase, file.bucket, file.path)) {
      throw new Error("删除后复核发现派生缩略图仍然存在。");
    }
  }
  manifest.status = "complete";
  manifest.completedAt = new Date().toISOString();
  await saveManifest(manifest);
  console.log(`清理完成：删除 ${files.length} 个派生缩略图，原图全部保留。`);
}

main().catch((error) => {
  console.error("缩略图清理失败：", error.message);
  process.exitCode = 1;
});

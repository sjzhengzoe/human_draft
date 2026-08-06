import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../server/config.mjs";
import {
  IMAGE_PROFILES,
  isOptimizedImagePath,
  optimizeImage,
  optimizeOriginalImage,
  optimizedImagePaths,
} from "../server/lib/image-processing.mjs";
import { getSupabaseAdmin } from "../server/lib/supabase.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const applyChanges = process.argv.includes("--apply");
const rollbackArgument = process.argv.find((argument) => argument.startsWith("--rollback="));
const rollbackPath = rollbackArgument ? resolve(rollbackArgument.slice("--rollback=".length)) : "";
const onlyArgument = process.argv.find((argument) => argument.startsWith("--only="));
const onlyTable = onlyArgument ? onlyArgument.slice("--only=".length) : "";
const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
const parsedLimit = limitArgument ? Number(limitArgument.slice("--limit=".length)) : null;
const itemLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
const idArgument = process.argv.find((argument) => argument.startsWith("--id="));
const selectedId = idArgument ? idArgument.slice("--id=".length) : "";
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const manifestPath = resolve(projectRoot, `image-storage-migration-${runId}.local`);

const targets = [
  {
    name: "菜品",
    table: "dishes",
    bucket: config.dishBucket,
    profile: IMAGE_PROFILES.dish,
    createThumbnail: false,
  },
  {
    name: "衣橱",
    table: "wardrobe_items",
    bucket: config.wardrobeBucket,
    profile: IMAGE_PROFILES.wardrobe,
  },
  {
    name: "关键节点",
    table: "key_moments",
    bucket: config.keyMomentBucket,
    profile: IMAGE_PROFILES.keyMoment,
  },
];

function assertRuntimeConfig() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("请先配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY。");
  }
}

function formatMegabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

async function readAllRows(supabase, table) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("id, image_path, thumbnail_path")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function downloadBuffer(bucket, path) {
  const { data, error } = await bucket.download(path);
  if (error) throw error;
  return Buffer.from(await data.arrayBuffer());
}

async function downloadOptionalBuffer(bucket, path) {
  if (!path) return null;
  const { data, error } = await bucket.download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

async function uploadOptimizedPair(bucket, paths, optimized) {
  const { error: imageError } = await bucket.upload(paths.imagePath, optimized.original, {
    cacheControl: "31536000",
    contentType: optimized.originalContentType,
    upsert: true,
  });
  if (imageError) throw imageError;

  if (!optimized.thumbnail || !paths.thumbnailPath) return;

  const { error: thumbnailError } = await bucket.upload(
    paths.thumbnailPath,
    optimized.thumbnail,
    {
      cacheControl: "31536000",
      contentType: optimized.thumbnailContentType,
      upsert: true,
    },
  );
  if (thumbnailError) {
    await bucket.remove([paths.imagePath]);
    throw thumbnailError;
  }
}

async function saveManifest(manifest) {
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function optimizeTarget(supabase, target, manifest, totals) {
  const rows = await readAllRows(supabase, target.table);
  const allCandidates = rows.filter(
    (row) =>
      row.image_path &&
      !isOptimizedImagePath(row.image_path) &&
      (!selectedId || row.id === selectedId),
  );
  const candidates = itemLimit ? allCandidates.slice(0, itemLimit) : allCandidates;
  console.log(`${target.name}：发现 ${candidates.length} 张待优化原图。`);
  const bucket = supabase.storage.from(target.bucket);

  for (const [index, row] of candidates.entries()) {
    try {
      const [source, oldThumbnail] = await Promise.all([
        downloadBuffer(bucket, row.image_path),
        downloadOptionalBuffer(bucket, row.thumbnail_path),
      ]);
      const optimized = target.createThumbnail === false
        ? await optimizeOriginalImage(source)
        : await optimizeImage(source, target.profile);
      const oldBytes = source.length + (oldThumbnail?.length || 0);
      const newBytes = optimized.original.length + (optimized.thumbnail?.length || 0);
      totals.oldBytes += oldBytes;
      totals.newBytes += newBytes;
      totals.processed += 1;

      if (applyChanges) {
        const directory = row.image_path.includes("/")
          ? row.image_path.slice(0, row.image_path.lastIndexOf("/"))
          : "migrated";
        const generatedPaths = optimizedImagePaths(`${directory}/migration-${row.id}`);
        const paths = {
          imagePath: generatedPaths.imagePath,
          thumbnailPath: optimized.thumbnail ? generatedPaths.thumbnailPath : null,
        };
        await uploadOptimizedPair(bucket, paths, optimized);

        const entry = {
          table: target.table,
          bucket: target.bucket,
          id: row.id,
          oldImagePath: row.image_path,
          oldThumbnailPath: row.thumbnail_path,
          newImagePath: paths.imagePath,
          newThumbnailPath: paths.thumbnailPath,
          oldBytes,
          newBytes,
          status: "uploaded",
        };
        manifest.entries.push(entry);
        await saveManifest(manifest);

        const { data, error } = await supabase
          .from(target.table)
          .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
          .eq("id", row.id)
          .eq("image_path", row.image_path)
          .select("id, image_path, thumbnail_path")
          .maybeSingle();
        if (error || !data || data.image_path !== paths.imagePath) {
          await bucket.remove([paths.imagePath, paths.thumbnailPath].filter(Boolean));
          throw error || new Error("记录已被其他操作更新，未切换图片路径。");
        }
        entry.status = "switched";
        await saveManifest(manifest);
      }

      console.log(
        `${target.name} ${index + 1}/${candidates.length}：${formatMegabytes(oldBytes)} → ${formatMegabytes(newBytes)}`,
      );
    } catch (error) {
      totals.failed += 1;
      console.error(`${target.name} ${index + 1}/${candidates.length} 优化失败：${error.message}`);
    }
  }
}

async function rollback(supabase) {
  const manifest = JSON.parse(await readFile(rollbackPath, "utf8"));
  let restored = 0;
  let skipped = 0;
  for (const entry of [...manifest.entries].reverse()) {
    const { data, error } = await supabase
      .from(entry.table)
      .update({
        image_path: entry.oldImagePath,
        thumbnail_path: entry.oldThumbnailPath,
      })
      .eq("id", entry.id)
      .eq("image_path", entry.newImagePath)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (data) restored += 1;
    else skipped += 1;
  }
  console.log(`回退完成：恢复 ${restored} 条，跳过 ${skipped} 条。新旧文件均未删除。`);
}

async function main() {
  assertRuntimeConfig();
  const supabase = getSupabaseAdmin();
  if (rollbackPath) {
    await rollback(supabase);
    return;
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    oldFilesRetained: true,
    entries: [],
  };
  const totals = { processed: 0, failed: 0, oldBytes: 0, newBytes: 0 };
  const selectedTargets = onlyTable
    ? targets.filter((target) => target.table === onlyTable)
    : targets;
  if (!selectedTargets.length) {
    throw new Error(`找不到图片类型：${onlyTable}`);
  }
  for (const target of selectedTargets) {
    await optimizeTarget(supabase, target, manifest, totals);
  }

  const savedBytes = Math.max(0, totals.oldBytes - totals.newBytes);
  console.log(
    `${applyChanges ? "迁移" : "预估"}完成：处理 ${totals.processed} 张，失败 ${totals.failed} 张，` +
      `${formatMegabytes(totals.oldBytes)} → ${formatMegabytes(totals.newBytes)}，` +
      `预计节省 ${formatMegabytes(savedBytes)}。`,
  );
  if (applyChanges) {
    console.log(`回退清单已保存：${manifestPath}`);
    console.log("旧图片仍然保留，确认线上显示正常后再单独清理。");
  } else {
    console.log("当前仅做预估，没有上传文件或修改数据库。使用 --apply 才会执行迁移。");
  }
  if (totals.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("图片优化失败：", error);
  process.exitCode = 1;
});

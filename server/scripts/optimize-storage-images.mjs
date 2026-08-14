import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { config } from "../config.mjs";
import {
  IMAGE_PROFILES,
  isOptimizedImagePath,
  optimizeImage,
  optimizeOriginalImage,
  optimizedImagePaths,
  optimizedThumbnailPath,
} from "../lib/image-processing.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const applyChanges = process.argv.includes("--apply");
const rollbackArgument = process.argv.find((value) => value.startsWith("--rollback="));
const manifestArgument = process.argv.find((value) => value.startsWith("--manifest="));
const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
const parsedLimit = Number(limitArgument?.slice("--limit=".length));
const itemLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : null;
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const defaultManifestPath = resolve(
  projectRoot,
  "..",
  "private-image-migrations",
  `image-cost-migration-${runId}.json`,
);
const manifestPath = resolve(manifestArgument?.slice("--manifest=".length) || defaultManifestPath);
const rollbackPath = rollbackArgument
  ? resolve(rollbackArgument.slice("--rollback=".length))
  : "";
const NEW_PIPELINE_CUTOFF = Date.parse("2026-08-14T03:20:16.000Z");

const datasets = [
  {
    table: "dishes",
    columns: "id,image_path,thumbnail_path,created_at,updated_at",
    bucket: config.dishBucket,
    kind: "single",
    profile: "dish",
    imageColumn: "image_path",
    thumbnailColumn: "thumbnail_path",
  },
  {
    table: "menu_places",
    columns: "id,image_path,thumbnail_path,created_at,updated_at",
    bucket: config.dishBucket,
    kind: "single",
    profile: "dish",
    imageColumn: "image_path",
    thumbnailColumn: "thumbnail_path",
  },
  {
    table: "menu_schedule_items",
    columns: "id,snapshot_image_path,snapshot_place_image_path,created_at",
    bucket: config.dishBucket,
    kind: "snapshots",
    profile: "dish",
    imageColumns: ["snapshot_image_path", "snapshot_place_image_path"],
  },
  {
    table: "activity_items",
    columns: "id,image_path,thumbnail_path,created_at,updated_at",
    bucket: config.activityBucket,
    kind: "pair",
    profile: "activity",
    imageColumn: "image_path",
    thumbnailColumn: "thumbnail_path",
  },
  {
    table: "media_entries",
    columns: "id,cover_url,created_at,updated_at",
    bucket: config.mediaCoverBucket,
    kind: "media",
    profile: "mediaCover",
    imageColumn: "cover_url",
  },
  {
    table: "media_seasons",
    columns: "id,cover_url,created_at,updated_at",
    bucket: config.mediaCoverBucket,
    kind: "media",
    profile: "mediaCover",
    imageColumn: "cover_url",
  },
  {
    table: "wardrobe_items",
    columns: "id,image_path,thumbnail_path,created_at,updated_at",
    bucket: config.wardrobeBucket,
    kind: "pair",
    profile: "wardrobe",
    imageColumn: "image_path",
    thumbnailColumn: "thumbnail_path",
  },
  {
    table: "key_moments",
    columns: "id,image_path,thumbnail_path,created_at,updated_at",
    bucket: config.keyMomentBucket,
    kind: "pair",
    profile: "keyMoment",
    imageColumn: "image_path",
    thumbnailColumn: "thumbnail_path",
  },
];

function assertRuntimeConfig() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("请先配置 SUPABASE_URL 和 SUPABASE_SECRET_KEY。");
  }
  if (applyChanges && rollbackPath) {
    throw new Error("--apply 与 --rollback 不能同时使用。");
  }
}

function formatMegabytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function mediaStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  if (!text.includes("://")) return text.replace(/^\/+/, "");
  try {
    const pathname = decodeURIComponent(new URL(text).pathname);
    const markers = [
      `/storage/v1/object/public/${config.mediaCoverBucket}/`,
      `/storage/v1/object/sign/${config.mediaCoverBucket}/`,
    ];
    for (const marker of markers) {
      const index = pathname.lastIndexOf(marker);
      if (index >= 0) return pathname.slice(index + marker.length);
    }
  } catch (_error) {
    return "";
  }
  return "";
}

function wasCreatedByCurrentPipeline(row, path) {
  if (!path) return false;
  if (isOptimizedImagePath(path)) return true;
  if (!path.endsWith("-normalized-v3.webp")) return false;
  return (Date.parse(row.created_at || "") || 0) >= NEW_PIPELINE_CUTOFF;
}

async function readAllRows(supabase, dataset) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from(dataset.table)
      .select(dataset.columns)
      .range(from, from + 499);
    if (error) throw new Error(`${dataset.table}：${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

function migrationBasePath(sourcePath, profile, key) {
  const slash = sourcePath.lastIndexOf("/");
  const directory = slash >= 0 ? sourcePath.slice(0, slash) : "migrated";
  const digest = createHash("sha256")
    .update(`${runId}\u0000${key}`)
    .digest("hex")
    .slice(0, 16);
  return `${directory}/migration-${profile}-${digest}`;
}

function registerTransform(transforms, { bucket, sourcePath, oldThumbnailPath = "", profile, pair }) {
  const key = `${bucket}\u0000${profile}\u0000${sourcePath}`;
  if (!transforms.has(key)) {
    const paths = optimizedImagePaths(migrationBasePath(sourcePath, profile, key));
    transforms.set(key, {
      key,
      bucket,
      sourcePath,
      oldThumbnailPath,
      profile,
      pair,
      newImagePath: paths.imagePath,
      newThumbnailPath: pair ? paths.thumbnailPath : null,
      status: "planned",
      oldBytes: 0,
      newBytes: 0,
    });
  } else if (oldThumbnailPath && !transforms.get(key).oldThumbnailPath) {
    transforms.get(key).oldThumbnailPath = oldThumbnailPath;
  }
  return key;
}

function addPlan(plans, dataset, row, oldValues, valueSpecs) {
  if (!Object.keys(valueSpecs).length) return;
  plans.push({
    table: dataset.table,
    id: row.id,
    oldValues,
    valueSpecs,
    newValues: {},
    status: "planned",
  });
}

function buildDatasetPlans(dataset, rows, transforms, plans) {
  for (const row of rows) {
    if (dataset.kind === "snapshots") {
      const oldValues = {};
      const valueSpecs = {};
      for (const column of dataset.imageColumns) {
        const path = row[column] || "";
        if (!path || wasCreatedByCurrentPipeline(row, path)) continue;
        oldValues[column] = row[column];
        valueSpecs[column] = {
          transformKey: registerTransform(transforms, {
            bucket: dataset.bucket,
            sourcePath: path,
            profile: dataset.profile,
            pair: false,
          }),
          output: "image",
        };
      }
      addPlan(plans, dataset, row, oldValues, valueSpecs);
      continue;
    }

    const rawImagePath = row[dataset.imageColumn] || "";
    const imagePath = dataset.kind === "media" ? mediaStoragePath(rawImagePath) : rawImagePath;
    if (!imagePath || wasCreatedByCurrentPipeline(row, imagePath)) continue;

    if (dataset.kind === "single") {
      const transformKey = registerTransform(transforms, {
        bucket: dataset.bucket,
        sourcePath: imagePath,
        oldThumbnailPath: row[dataset.thumbnailColumn] || "",
        profile: dataset.profile,
        pair: false,
      });
      addPlan(
        plans,
        dataset,
        row,
        {
          [dataset.imageColumn]: row[dataset.imageColumn],
          [dataset.thumbnailColumn]: row[dataset.thumbnailColumn],
        },
        {
          [dataset.imageColumn]: { transformKey, output: "image" },
          [dataset.thumbnailColumn]: { value: null },
        },
      );
      continue;
    }

    const oldThumbnailPath = dataset.kind === "media"
      ? optimizedThumbnailPath(imagePath)
      : row[dataset.thumbnailColumn] || "";
    const transformKey = registerTransform(transforms, {
      bucket: dataset.bucket,
      sourcePath: imagePath,
      oldThumbnailPath,
      profile: dataset.profile,
      pair: true,
    });
    if (dataset.kind === "media") {
      addPlan(
        plans,
        dataset,
        row,
        { [dataset.imageColumn]: row[dataset.imageColumn] },
        { [dataset.imageColumn]: { transformKey, output: "image" } },
      );
    } else {
      addPlan(
        plans,
        dataset,
        row,
        {
          [dataset.imageColumn]: row[dataset.imageColumn],
          [dataset.thumbnailColumn]: row[dataset.thumbnailColumn],
        },
        {
          [dataset.imageColumn]: { transformKey, output: "image" },
          [dataset.thumbnailColumn]: { transformKey, output: "thumbnail" },
        },
      );
    }
  }
}

async function buildPlan(supabase) {
  const transforms = new Map();
  const plans = [];
  for (const dataset of datasets) {
    const rows = await readAllRows(supabase, dataset);
    buildDatasetPlans(dataset, rows, transforms, plans);
  }
  let transformList = [...transforms.values()];
  if (itemLimit) {
    transformList = transformList.slice(0, itemLimit);
    const accepted = new Set(transformList.map(({ key }) => key));
    return {
      transforms: transformList,
      plans: plans.filter((plan) =>
        Object.values(plan.valueSpecs).every(
          (spec) => !spec.transformKey || accepted.has(spec.transformKey),
        )
      ),
    };
  }
  return { transforms: transformList, plans };
}

async function downloadBuffer(supabase, bucketName, path, cache) {
  if (!path) return null;
  const key = `${bucketName}\u0000${path}`;
  if (cache.has(key)) return cache.get(key);
  const { data, error } = await supabase.storage.from(bucketName).download(path);
  if (error || !data) throw new Error(`对象存储读取失败：${error?.message || "文件不存在"}`);
  const buffer = Buffer.from(await data.arrayBuffer());
  cache.set(key, buffer);
  return buffer;
}

async function downloadOptionalBuffer(supabase, bucketName, path, cache) {
  if (!path) return null;
  try {
    return await downloadBuffer(supabase, bucketName, path, cache);
  } catch (_error) {
    return null;
  }
}

async function prepareTransforms(supabase, transforms) {
  const oldObjects = new Map();
  for (const [index, transform] of transforms.entries()) {
    const source = await downloadBuffer(
      supabase,
      transform.bucket,
      transform.sourcePath,
      new Map(),
    );
    const oldThumbnail = await downloadOptionalBuffer(
      supabase,
      transform.bucket,
      transform.oldThumbnailPath,
      new Map(),
    );
    oldObjects.set(`${transform.bucket}\u0000${transform.sourcePath}`, source.length);
    if (oldThumbnail) {
      oldObjects.set(
        `${transform.bucket}\u0000${transform.oldThumbnailPath}`,
        oldThumbnail.length,
      );
    }
    const profile = IMAGE_PROFILES[transform.profile];
    const optimized = transform.pair
      ? await optimizeImage(source, profile)
      : await optimizeOriginalImage(source, profile.original);
    transform.output = optimized;
    transform.oldBytes = source.length + (oldThumbnail?.length || 0);
    transform.newBytes = optimized.original.length + (optimized.thumbnail?.length || 0);
    transform.status = "prepared";
    if ((index + 1) % 25 === 0 || index + 1 === transforms.length) {
      console.log(`已分析 ${index + 1}/${transforms.length} 张唯一原图。`);
    }
  }
  return [...oldObjects.values()].reduce((sum, bytes) => sum + bytes, 0);
}

function resolvePlanValues(plans, transforms) {
  const byKey = new Map(transforms.map((transform) => [transform.key, transform]));
  for (const plan of plans) {
    for (const [column, spec] of Object.entries(plan.valueSpecs)) {
      if (Object.hasOwn(spec, "value")) {
        plan.newValues[column] = spec.value;
      } else {
        const transform = byKey.get(spec.transformKey);
        plan.newValues[column] = spec.output === "thumbnail"
          ? transform.newThumbnailPath
          : transform.newImagePath;
      }
    }
  }
}

function publicManifest(manifest) {
  return {
    ...manifest,
    transforms: manifest.transforms.map(({ output, key, ...transform }) => transform),
    plans: manifest.plans.map(({ valueSpecs, ...plan }) => plan),
  };
}

async function saveManifest(manifest, path = manifestPath) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(publicManifest(manifest), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

async function uploadTransforms(supabase, manifest) {
  for (const [index, transform] of manifest.transforms.entries()) {
    const bucket = supabase.storage.from(transform.bucket);
    const uploads = [
      [transform.newImagePath, transform.output.original, transform.output.originalContentType],
    ];
    if (transform.pair) {
      uploads.push([
        transform.newThumbnailPath,
        transform.output.thumbnail,
        transform.output.thumbnailContentType,
      ]);
    }
    for (const [path, buffer, contentType] of uploads) {
      const { error } = await bucket.upload(path, buffer, {
        cacheControl: "3600",
        contentType,
        upsert: false,
      });
      if (error) throw new Error(`上传迁移图片失败：${error.message}`);
      const stored = await downloadBuffer(supabase, transform.bucket, path, new Map());
      if (stored.length !== buffer.length) throw new Error("上传后的图片大小校验失败。");
      const metadata = await sharp(stored).metadata();
      if (metadata.format !== "webp" || !metadata.width || !metadata.height) {
        throw new Error("上传后的图片格式校验失败。");
      }
    }
    transform.status = "uploaded";
    delete transform.output;
    await saveManifest(manifest);
    if ((index + 1) % 25 === 0 || index + 1 === manifest.transforms.length) {
      console.log(`已上传并校验 ${index + 1}/${manifest.transforms.length} 张唯一原图。`);
    }
  }
}

function addConditions(query, values) {
  let conditioned = query;
  for (const [column, value] of Object.entries(values)) {
    conditioned = value === null
      ? conditioned.is(column, null)
      : conditioned.eq(column, value);
  }
  return conditioned;
}

async function switchPlan(supabase, plan, values, expectedValues) {
  let query = supabase.from(plan.table).update(values).eq("id", plan.id);
  query = addConditions(query, expectedValues);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`${plan.table} 更新失败：${error.message}`);
  return Boolean(data);
}

async function rollbackPlans(supabase, manifest, { save = true } = {}) {
  let restored = 0;
  let skipped = 0;
  for (const plan of [...manifest.plans].reverse()) {
    if (plan.status !== "switched") continue;
    const changed = await switchPlan(supabase, plan, plan.oldValues, plan.newValues);
    if (changed) {
      plan.status = "rolled_back";
      restored += 1;
    } else {
      skipped += 1;
    }
    if (save) await saveManifest(manifest, rollbackPath || manifestPath);
  }
  return { restored, skipped };
}

async function switchReferences(supabase, manifest) {
  try {
    for (const [index, plan] of manifest.plans.entries()) {
      const changed = await switchPlan(supabase, plan, plan.newValues, plan.oldValues);
      if (!changed) throw new Error(`${plan.table} 的记录已变化，已停止切换。`);
      plan.status = "switched";
      await saveManifest(manifest);
      if ((index + 1) % 50 === 0 || index + 1 === manifest.plans.length) {
        console.log(`已切换 ${index + 1}/${manifest.plans.length} 条数据库记录。`);
      }
    }
  } catch (error) {
    manifest.status = "rolling_back";
    await saveManifest(manifest);
    const result = await rollbackPlans(supabase, manifest);
    manifest.status = "rolled_back_after_failure";
    manifest.failure = error.message;
    await saveManifest(manifest);
    throw new Error(`数据库切换失败，已自动恢复 ${result.restored} 条记录：${error.message}`);
  }
}

async function verifyReferences(supabase, manifest) {
  for (const plan of manifest.plans) {
    let query = supabase.from(plan.table).select("id").eq("id", plan.id);
    query = addConditions(query, plan.newValues);
    const { data, error } = await query.maybeSingle();
    if (error || !data) throw new Error(`${plan.table} 迁移后引用校验失败。`);
  }
}

async function performRollback(supabase) {
  const manifest = JSON.parse(await readFile(rollbackPath, "utf8"));
  if (!manifest.oldFilesRetained) throw new Error("清单未声明保留旧文件，拒绝自动回退。");
  const result = await rollbackPlans(supabase, manifest);
  manifest.status = "rolled_back";
  manifest.rolledBackAt = new Date().toISOString();
  await saveManifest(manifest, rollbackPath);
  console.log(`回退完成：恢复 ${result.restored} 条，跳过 ${result.skipped} 条；文件均未删除。`);
}

async function main() {
  assertRuntimeConfig();
  const supabase = getSupabaseAdmin();
  if (rollbackPath) {
    await performRollback(supabase);
    return;
  }

  const { transforms, plans } = await buildPlan(supabase);
  if (!transforms.length) {
    console.log("没有需要迁移的旧图片。");
    return;
  }
  console.log(`计划处理 ${transforms.length} 张唯一原图，更新 ${plans.length} 条数据库记录。`);
  const oldBytes = await prepareTransforms(supabase, transforms);
  resolvePlanValues(plans, transforms);
  const newBytes = transforms.reduce((sum, transform) => sum + transform.newBytes, 0);
  const manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    status: applyChanges ? "prepared" : "dry_run",
    oldFilesRetained: true,
    migrationDeletesFiles: false,
    transforms,
    plans,
    totals: { uniqueImages: transforms.length, records: plans.length, oldBytes, newBytes },
  };

  console.log(
    `当前引用文件 ${formatMegabytes(oldBytes)}，处理后 ${formatMegabytes(newBytes)}，` +
      `活动数据预计减少 ${formatMegabytes(Math.max(0, oldBytes - newBytes))}。`,
  );
  if (!applyChanges) {
    console.log("当前是只读预演，没有上传文件或修改数据库。使用 --apply 才会执行。 ");
    return;
  }

  await saveManifest(manifest);
  await uploadTransforms(supabase, manifest);
  manifest.status = "uploaded";
  await saveManifest(manifest);
  await switchReferences(supabase, manifest);
  await verifyReferences(supabase, manifest);
  manifest.status = "complete";
  manifest.completedAt = new Date().toISOString();
  await saveManifest(manifest);
  console.log(`迁移完成。回退清单：${manifestPath}`);
  console.log("旧图片与旧缩略图全部保留，迁移程序没有删除任何文件。");
}

main().catch((error) => {
  console.error("图片迁移失败：", error.message);
  process.exitCode = 1;
});

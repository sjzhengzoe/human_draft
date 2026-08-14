import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { config } from "../config.mjs";
import { IMAGE_PROFILES, optimizeOriginalImage } from "../lib/image-processing.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const applyChanges = process.argv.includes("--apply");
const sourceArgument = process.argv.find((value) => value.startsWith("--source-manifest="));
const manifestArgument = process.argv.find((value) => value.startsWith("--manifest="));
const rollbackArgument = process.argv.find((value) => value.startsWith("--rollback="));
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const sourceManifestPath = sourceArgument
  ? resolve(sourceArgument.slice("--source-manifest=".length))
  : "";
const manifestPath = resolve(
  manifestArgument?.slice("--manifest=".length) ||
    resolve(projectRoot, "..", "private-image-migrations", `key-moment-quality-${runId}.json`),
);
const rollbackPath = rollbackArgument
  ? resolve(rollbackArgument.slice("--rollback=".length))
  : "";

function assertRuntimeConfig() {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("缺少 Supabase 服务端配置。");
  }
  if (applyChanges && rollbackPath) throw new Error("--apply 与 --rollback 不能同时使用。");
  if (!rollbackPath && !sourceManifestPath) throw new Error("请通过 --source-manifest 指定旧图迁移清单。");
}

function formatMiB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

function targetPath(currentPath, sourcePath) {
  const slash = currentPath.lastIndexOf("/");
  const directory = slash >= 0 ? currentPath.slice(0, slash) : "migrated";
  const profile = IMAGE_PROFILES.keyMoment.original;
  const digest = createHash("sha256")
    .update(`${sourcePath}\u0000${profile.width}\u0000${profile.height}\u0000${profile.quality}`)
    .digest("hex")
    .slice(0, 16);
  return `${directory}/quality-v5-${digest}.webp`;
}

async function downloadBuffer(supabase, path, { optional = false } = {}) {
  const { data, error } = await supabase.storage.from(config.keyMomentBucket).download(path);
  if (error || !data) {
    if (optional) return null;
    throw new Error(`读取关键节点图片失败：${error?.message || "文件不存在"}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

async function readAllMoments(supabase) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase
      .from("key_moments")
      .select("id,user_id,image_path,thumbnail_path")
      .not("image_path", "is", null)
      .range(from, from + 499);
    if (error) throw new Error(`读取关键节点失败：${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 500) return rows;
  }
}

async function buildPlan(supabase) {
  const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
  if (!sourceManifest.oldFilesRetained || sourceManifest.migrationDeletesFiles !== false) {
    throw new Error("旧迁移清单没有确认保留源图片，拒绝继续。");
  }
  const sourcesByCurrentPath = new Map(
    (sourceManifest.transforms || [])
      .filter((item) => item.profile === "keyMoment" && item.sourcePath && item.newImagePath)
      .map((item) => [item.newImagePath, item.sourcePath]),
  );
  const moments = await readAllMoments(supabase);
  const plans = moments
    .filter((moment) => sourcesByCurrentPath.has(moment.image_path))
    .map((moment) => {
      const sourcePath = sourcesByCurrentPath.get(moment.image_path);
      return {
        id: moment.id,
        userId: moment.user_id,
        sourcePath,
        previousPath: moment.image_path,
        targetPath: targetPath(moment.image_path, sourcePath),
        oldValues: {
          image_path: moment.image_path,
          thumbnail_path: moment.thumbnail_path,
        },
        newValues: {
          image_path: targetPath(moment.image_path, sourcePath),
          thumbnail_path: null,
        },
        status: "planned",
        sourceBytes: 0,
        previousBytes: 0,
        newBytes: 0,
      };
    });
  return plans;
}

async function preparePlans(supabase, plans) {
  for (const [index, plan] of plans.entries()) {
    const [source, previous] = await Promise.all([
      downloadBuffer(supabase, plan.sourcePath),
      downloadBuffer(supabase, plan.previousPath),
    ]);
    const sourceMetadata = await sharp(source).metadata();
    const sourceAlreadyCompliant =
      sourceMetadata.format === "webp" &&
      Boolean(sourceMetadata.width) &&
      Boolean(sourceMetadata.height) &&
      sourceMetadata.width <= IMAGE_PROFILES.keyMoment.original.width &&
      sourceMetadata.height <= IMAGE_PROFILES.keyMoment.original.height;
    const output = sourceAlreadyCompliant
      ? source
      : (await optimizeOriginalImage(source, IMAGE_PROFILES.keyMoment.original)).original;
    const metadata = await sharp(output).metadata();
    if (
      metadata.format !== "webp" ||
      !metadata.width ||
      !metadata.height ||
      metadata.width > IMAGE_PROFILES.keyMoment.original.width ||
      metadata.height > IMAGE_PROFILES.keyMoment.original.height
    ) {
      throw new Error("关键节点高质量图片格式或尺寸校验失败。");
    }
    plan.sourceBytes = source.length;
    plan.previousBytes = previous.length;
    plan.newBytes = output.length;
    plan.width = metadata.width;
    plan.height = metadata.height;
    plan.sourceCopiedWithoutReencoding = sourceAlreadyCompliant;
    plan.output = output;
    plan.status = "prepared";
    if ((index + 1) % 10 === 0 || index + 1 === plans.length) {
      console.log(`已分析 ${index + 1}/${plans.length} 张关键节点图片。`);
    }
  }
}

function manifestForDisk(manifest) {
  return {
    ...manifest,
    plans: manifest.plans.map(({ output, ...plan }) => plan),
  };
}

async function saveManifest(manifest, path = manifestPath) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifestForDisk(manifest), null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, path);
}

async function uploadPlans(supabase, manifest) {
  const bucket = supabase.storage.from(config.keyMomentBucket);
  for (const [index, plan] of manifest.plans.entries()) {
    const existing = await downloadBuffer(supabase, plan.targetPath, { optional: true });
    if (existing) {
      const expectedHash = createHash("sha256").update(plan.output).digest("hex");
      const existingHash = createHash("sha256").update(existing).digest("hex");
      if (existingHash !== expectedHash) throw new Error("目标路径已存在不同内容，拒绝覆盖。");
    } else {
      const { error } = await bucket.upload(plan.targetPath, plan.output, {
        cacheControl: "3600",
        contentType: "image/webp",
        upsert: false,
      });
      if (error) throw new Error(`上传关键节点高质量图片失败：${error.message}`);
    }
    const stored = await downloadBuffer(supabase, plan.targetPath);
    if (stored.length !== plan.output.length) throw new Error("上传后图片大小校验失败。");
    plan.status = "uploaded";
    delete plan.output;
    await saveManifest(manifest);
    if ((index + 1) % 10 === 0 || index + 1 === manifest.plans.length) {
      console.log(`已上传并校验 ${index + 1}/${manifest.plans.length} 张关键节点图片。`);
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
  let query = supabase.from("key_moments").update(values).eq("id", plan.id);
  if (plan.userId) query = query.eq("user_id", plan.userId);
  query = addConditions(query, expectedValues);
  const { data, error } = await query.select("id").maybeSingle();
  if (error) throw new Error(`关键节点引用更新失败：${error.message}`);
  return Boolean(data);
}

async function recordMatches(supabase, plan, values) {
  let query = supabase.from("key_moments").select("id").eq("id", plan.id);
  if (plan.userId) query = query.eq("user_id", plan.userId);
  query = addConditions(query, values);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`关键节点引用核对失败：${error.message}`);
  return Boolean(data);
}

async function rollbackPlans(supabase, manifest, path) {
  let restored = 0;
  let skipped = 0;
  for (const plan of [...manifest.plans].reverse()) {
    if (!["switched", "complete"].includes(plan.status)) continue;
    const changed = await switchPlan(supabase, plan, plan.oldValues, plan.newValues);
    if (changed || await recordMatches(supabase, plan, plan.oldValues)) {
      plan.status = "rolled_back";
      if (changed) restored += 1;
    } else {
      skipped += 1;
    }
    await saveManifest(manifest, path);
  }
  return { restored, skipped };
}

async function switchReferences(supabase, manifest) {
  try {
    for (const [index, plan] of manifest.plans.entries()) {
      const changed = await switchPlan(supabase, plan, plan.newValues, plan.oldValues);
      if (!changed && !await recordMatches(supabase, plan, plan.newValues)) {
        throw new Error("关键节点记录已变化，已停止切换。");
      }
      plan.status = "switched";
      await saveManifest(manifest);
      if ((index + 1) % 10 === 0 || index + 1 === manifest.plans.length) {
        console.log(`已切换 ${index + 1}/${manifest.plans.length} 条关键节点记录。`);
      }
    }
  } catch (error) {
    manifest.status = "rolling_back";
    await saveManifest(manifest);
    const result = await rollbackPlans(supabase, manifest, manifestPath);
    manifest.status = "rolled_back_after_failure";
    manifest.failure = error.message;
    await saveManifest(manifest);
    throw new Error(`切换失败，已自动恢复 ${result.restored} 条记录：${error.message}`);
  }
}

async function verifyReferences(supabase, manifest) {
  for (const plan of manifest.plans) {
    if (!await recordMatches(supabase, plan, plan.newValues)) {
      throw new Error("关键节点迁移后引用校验失败。");
    }
    const stored = await downloadBuffer(supabase, plan.targetPath);
    const metadata = await sharp(stored).metadata();
    if (stored.length !== plan.newBytes || metadata.width !== plan.width || metadata.height !== plan.height) {
      throw new Error("关键节点迁移后对象校验失败。");
    }
  }
}

async function verifyOrRollback(supabase, manifest) {
  try {
    await verifyReferences(supabase, manifest);
  } catch (error) {
    manifest.status = "rolling_back_after_verification_failure";
    await saveManifest(manifest);
    const result = await rollbackPlans(supabase, manifest, manifestPath);
    manifest.status = "rolled_back_after_verification_failure";
    manifest.failure = error.message;
    await saveManifest(manifest);
    throw new Error(`验收失败，已自动恢复 ${result.restored} 条记录：${error.message}`);
  }
}

async function performRollback(supabase) {
  const manifest = JSON.parse(await readFile(rollbackPath, "utf8"));
  if (!manifest.oldFilesRetained || manifest.migrationDeletesFiles !== false) {
    throw new Error("回退清单不符合旧文件保留要求。");
  }
  const result = await rollbackPlans(supabase, manifest, rollbackPath);
  manifest.status = "rolled_back";
  manifest.rolledBackAt = new Date().toISOString();
  await saveManifest(manifest, rollbackPath);
  console.log(`回退完成：恢复 ${result.restored} 条，跳过 ${result.skipped} 条；图片文件均保留。`);
}

async function main() {
  assertRuntimeConfig();
  const supabase = getSupabaseAdmin();
  if (rollbackPath) {
    await performRollback(supabase);
    return;
  }
  const plans = await buildPlan(supabase);
  if (!plans.length) {
    console.log("没有需要升级的关键节点图片。");
    return;
  }
  console.log(`计划从迁移前版本重新处理 ${plans.length} 张关键节点图片。`);
  await preparePlans(supabase, plans);
  const totals = {
    images: plans.length,
    sourceBytes: plans.reduce((sum, plan) => sum + plan.sourceBytes, 0),
    previousBytes: plans.reduce((sum, plan) => sum + plan.previousBytes, 0),
    newBytes: plans.reduce((sum, plan) => sum + plan.newBytes, 0),
  };
  console.log(
    `当前版本 ${formatMiB(totals.previousBytes)}，高质量版本 ${formatMiB(totals.newBytes)}。`,
  );
  if (!applyChanges) {
    console.log("当前为只读预演，没有上传文件或修改数据库。使用 --apply 才会执行。");
    return;
  }
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    status: "prepared",
    targetProfile: IMAGE_PROFILES.keyMoment.original,
    oldFilesRetained: true,
    sourceFilesRetained: true,
    migrationDeletesFiles: false,
    sourceManifestPath,
    plans,
    totals,
  };
  await saveManifest(manifest);
  await uploadPlans(supabase, manifest);
  manifest.status = "uploaded";
  await saveManifest(manifest);
  await switchReferences(supabase, manifest);
  await verifyOrRollback(supabase, manifest);
  manifest.plans.forEach((plan) => { plan.status = "complete"; });
  manifest.status = "complete";
  manifest.completedAt = new Date().toISOString();
  await saveManifest(manifest);
  console.log(`关键节点高质量迁移完成。回退清单：${manifestPath}`);
  console.log("迁移前源图和当前旧版本均保留，本次没有删除任何文件。");
}

main().catch((error) => {
  console.error("关键节点图片质量迁移失败：", error.message);
  process.exitCode = 1;
});

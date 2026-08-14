import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "../config.mjs";
import {
  IMAGE_PROFILES,
  optimizeOriginalImage,
} from "../lib/image-processing.mjs";
import {
  cosObjectKey,
  getCosObject,
  listCosObjects,
  putCosObject,
} from "../lib/cos-storage.mjs";
import { getSupabaseAdmin } from "../lib/supabase.mjs";

const apply = process.argv.includes("--apply");
const sourceManifestArgument = process.argv.find((argument) => argument.startsWith("--source-manifest="));
const sourceManifestPath = sourceManifestArgument?.slice("--source-manifest=".length) || "";
const sourceDirectory = process.env.MEDIA_COVER_RECOVERY_DIR
  || resolve(process.cwd(), "..", "private-image-migrations", "media-cover-recovery");
const originalsDirectory = resolve(sourceDirectory, "originals");
const manifestPath = resolve(sourceDirectory, apply ? "apply-manifest.json" : "dry-run-manifest.json");
const mediaCoverPrefix = `${config.mediaCoverBucket}/`;
const queryDelayMs = 250;

const sleep = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

function sha256(bufferOrText) {
  return createHash("sha256").update(bufferOrText).digest("hex");
}

function mediaCoverStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const normalized = value.trim();
  if (!normalized.includes("://")) return normalized.replace(/^\/+/, "");
  try {
    const pathname = decodeURIComponent(new URL(normalized).pathname);
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

function normalizedTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•・—–\-:：!！?？,，.。'"“”‘’()（）\[\]【】~～/\\]/gu, "");
}

function chooseCandidate(title, candidates) {
  const target = normalizedTitle(title);
  const usable = (Array.isArray(candidates) ? candidates : []).filter((candidate) => {
    try {
      const imageUrl = new URL(candidate?.img || "");
      return imageUrl.protocol === "https:" && imageUrl.hostname.endsWith(".doubanio.com");
    } catch (_error) {
      return false;
    }
  });
  const exact = usable.find((candidate) => [candidate.title, candidate.sub_title]
    .some((candidateTitle) => normalizedTitle(candidateTitle) === target));
  if (exact) return { candidate: exact, match: "exact" };
  const close = usable.find((candidate) => {
    const candidateTitle = normalizedTitle(candidate.title);
    return candidateTitle.includes(target) || target.includes(candidateTitle);
  });
  if (close) return { candidate: close, match: "contains" };
  return usable.length ? { candidate: usable[0], match: "first-result" } : null;
}

function trustedSourceImageUrl(value) {
  const url = new URL(String(value || ""));
  const trustedHost = url.hostname === "bangumi.tv"
    || url.hostname === "lain.bgm.tv"
    || url.hostname.endsWith(".doubanio.com");
  if (url.protocol !== "https:" || !trustedHost) {
    throw new Error("封面来源不在允许的影视资料域名中");
  }
  return url.toString();
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

async function searchCover(title) {
  const url = new URL("https://movie.douban.com/j/subject_suggest");
  url.searchParams.set("q", title);
  const response = await fetchWithRetry(url, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  const result = chooseCandidate(title, await response.json());
  await sleep(queryDelayMs);
  return result;
}

async function writeManifest(manifest) {
  await mkdir(sourceDirectory, { recursive: true, mode: 0o700 });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  if (config.imageStorageProvider !== "cos") {
    throw new Error("当前图片存储来源不是 COS，拒绝执行恢复。" );
  }
  const supabase = getSupabaseAdmin();
  const sourceManifest = sourceManifestPath
    ? JSON.parse(await readFile(sourceManifestPath, "utf8"))
    : null;
  const sourceByPath = new Map((sourceManifest?.items || [])
    .filter((item) => item?.path && item?.source?.imageUrl)
    .map((item) => [item.path, item]));
  const [entriesResult, objects] = await Promise.all([
    supabase.from("media_entries").select("id,title,media_type,cover_url").order("title"),
    listCosObjects(mediaCoverPrefix),
  ]);
  if (entriesResult.error) throw entriesResult.error;

  const existingKeys = new Set(objects.map((object) => object.Key));
  const missingEntries = (entriesResult.data || []).map((entry) => ({
    title: entry.title,
    mediaType: entry.media_type,
    path: mediaCoverStoragePath(entry.cover_url),
  })).filter((entry) => entry.path && !existingKeys.has(cosObjectKey(config.mediaCoverBucket, entry.path)));

  const manifest = {
    version: 1,
    mode: apply ? "apply" : "dry-run",
    createdAt: new Date().toISOString(),
    bucket: config.mediaCoverBucket,
    existingObjectCount: objects.length,
    missingEntryCount: missingEntries.length,
    originalsRetained: apply,
    items: [],
    summary: {},
  };

  if (apply) await mkdir(originalsDirectory, { recursive: true, mode: 0o700 });

  for (const entry of missingEntries) {
    const item = {
      title: entry.title,
      mediaType: entry.mediaType,
      path: entry.path,
      status: "pending",
    };
    manifest.items.push(item);
    try {
      const prepared = sourceByPath.get(entry.path);
      const match = prepared
        ? { candidate: prepared.source, match: prepared.match || "prepared" }
        : await searchCover(entry.title);
      if (!match) throw new Error("没有搜索到可用封面");
      item.match = match.match;
      item.source = {
        provider: String(match.candidate.provider || (prepared ? "prepared" : "douban")),
        id: String(match.candidate.id || ""),
        title: String(match.candidate.title || ""),
        subTitle: String(match.candidate.subTitle || match.candidate.sub_title || ""),
        year: String(match.candidate.year || ""),
        imageUrl: trustedSourceImageUrl(match.candidate.imageUrl || match.candidate.img),
      };
      item.status = apply ? "matched" : "planned";
      if (!apply) continue;

      const key = cosObjectKey(config.mediaCoverBucket, entry.path);
      try {
        const existing = await getCosObject(key);
        if (existing.length) {
          item.status = "skipped-existing";
          continue;
        }
      } catch (error) {
        if (Number(error?.statusCode) !== 404 && String(error?.code) !== "NoSuchKey") throw error;
      }

      const sourceFilename = `${sha256(entry.path).slice(0, 24)}.source`;
      const sourceFilePath = resolve(originalsDirectory, sourceFilename);
      let sourceBuffer;
      try {
        sourceBuffer = await readFile(sourceFilePath);
        item.sourceBackupReused = true;
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
        const sourceResponse = await fetchWithRetry(item.source.imageUrl, {
          headers: {
            referer: item.source.provider === "douban"
              ? "https://movie.douban.com/"
              : "https://bangumi.tv/",
            "user-agent": "human-draft/1.0 (https://gufeifei.cn)",
          },
        });
        sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer());
        if (!sourceBuffer.length) throw new Error("下载到的封面为空");
        await writeFile(sourceFilePath, sourceBuffer, { mode: 0o600 });
        item.sourceBackupReused = false;
      }
      if (!sourceBuffer.length) throw new Error("原始封面备份为空");

      const optimized = await optimizeOriginalImage(sourceBuffer, IMAGE_PROFILES.mediaCover.original);
      await putCosObject({
        key,
        buffer: optimized.original,
        contentType: optimized.originalContentType,
        cacheControl: "3600",
      });
      const uploaded = await getCosObject(key);
      if (!uploaded.equals(optimized.original)) throw new Error("上传后逐字节校验失败");
      item.sourceBytes = sourceBuffer.length;
      item.sourceSha256 = sha256(sourceBuffer);
      item.uploadedBytes = uploaded.length;
      item.uploadedSha256 = sha256(uploaded);
      item.originalBackup = sourceFilename;
      item.status = "uploaded-verified";
      existingKeys.add(key);
    } catch (error) {
      item.status = "failed";
      item.error = error?.message || String(error);
    }
    await writeManifest(manifest);
  }

  manifest.completedAt = new Date().toISOString();
  manifest.summary = Object.fromEntries(
    [...new Set(manifest.items.map((item) => item.status))].map((status) => [
      status,
      manifest.items.filter((item) => item.status === status).length,
    ]),
  );
  manifest.summary.matchTypes = Object.fromEntries(
    [...new Set(manifest.items.map((item) => item.match).filter(Boolean))].map((match) => [
      match,
      manifest.items.filter((item) => item.match === match).length,
    ]),
  );
  await writeManifest(manifest);
  console.log(JSON.stringify({
    mode: manifest.mode,
    missingEntryCount: manifest.missingEntryCount,
    summary: manifest.summary,
    manifestPath,
  }));

  if (manifest.items.some((item) => item.status === "failed")) process.exitCode = 1;
}

await main();

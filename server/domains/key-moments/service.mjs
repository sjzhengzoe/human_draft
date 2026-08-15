import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { cosObjectKey } from "../../lib/cos-storage.mjs";
import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  readMultipartImage,
  STANDARD_IMAGE_TYPES,
} from "../../http/multipart-image.mjs";
import { UUID_PATTERN } from "../shared/records.mjs";
import {
  createSignedUrlMap,
  removeStorageImages,
  uploadStandardImage,
} from "../shared/image-storage.mjs";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GRANULARITIES = new Set(["year", "month", "day"]);
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const MAX_CONTENT_LENGTH = 2_000;
const MAX_IMAGE_COUNT = 9;
const DEFAULT_PAGE_SIZE = 40;
const MAX_PAGE_SIZE = 100;
const DETAIL_CONTEXT_SIZE = 8;
const STALE_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DRAFT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DRAFT_CLEANUP_BATCH_SIZE = 100;

const lastDraftCleanupByUid = new Map();

function assertUuid(value) {
  assertCondition(
    typeof value === "string" && UUID_PATTERN.test(value),
    400,
    "INVALID_ID",
    "人生节点编号无效。",
  );
  return value;
}

function normalizeContent(value) {
  assertCondition(typeof value === "string", 400, "INVALID_CONTENT", "文案格式无效。");
  const content = value.trim();
  assertCondition(
    content.length <= MAX_CONTENT_LENGTH,
    400,
    "CONTENT_TOO_LONG",
    "文案不能超过 2000 个字。",
  );
  return content;
}

function normalizeOccurredAt(value) {
  assertCondition(typeof value === "string" && value.trim(), 400, "TIME_REQUIRED", "请选择节点时间。");
  const occurredAt = new Date(value);
  assertCondition(!Number.isNaN(occurredAt.getTime()), 400, "INVALID_TIME", "节点时间无效。");
  const year = new Date(occurredAt.getTime() + 8 * 60 * 60 * 1000).getUTCFullYear();
  assertCondition(year >= 1900 && year <= 2100, 400, "INVALID_TIME", "节点时间需在 1900 至 2100 年之间。");
  return occurredAt.toISOString();
}

function normalizeImagePaths(value, fieldName = "图片列表") {
  let paths = value;
  if (typeof paths === "string") {
    try {
      paths = JSON.parse(paths);
    } catch (_error) {
      paths = null;
    }
  }
  assertCondition(Array.isArray(paths), 400, "INVALID_IMAGE_PATHS", `${fieldName}格式无效。`);
  const normalized = paths.map((path) => String(path || "").trim());
  assertCondition(
    normalized.length <= MAX_IMAGE_COUNT &&
      normalized.every(Boolean) &&
      new Set(normalized).size === normalized.length,
    400,
    "INVALID_IMAGE_PATHS",
    `最多保留 ${MAX_IMAGE_COUNT} 张图片，且图片不能重复。`,
  );
  return normalized;
}

function shanghaiIso(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000).toISOString();
}

export function periodBounds(query = {}) {
  const granularity = typeof query.granularity === "string" ? query.granularity : "day";
  assertCondition(GRANULARITIES.has(granularity), 400, "INVALID_GRANULARITY", "请选择年、月或日视图。");
  const matched = DATE_PATTERN.exec(String(query.date || ""));
  assertCondition(matched, 400, "INVALID_DATE", "请选择有效日期。");
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  assertCondition(
    year >= 1900 && year <= 2100 &&
      check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day,
    400,
    "INVALID_DATE",
    "请选择有效日期。",
  );

  if (granularity === "year") {
    return { start: shanghaiIso(year, 1, 1), end: shanghaiIso(year + 1, 1, 1) };
  }
  if (granularity === "month") {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return { start: shanghaiIso(year, month, 1), end: shanghaiIso(nextYear, nextMonth, 1) };
  }
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    start: shanghaiIso(year, month, day),
    end: shanghaiIso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}

function pageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const parsed = Number(value ?? fallback);
  assertCondition(
    Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE_SIZE,
    400,
    "INVALID_PAGE_SIZE",
    `每次最多读取 ${MAX_PAGE_SIZE} 条人生节点。`,
  );
  return parsed;
}

function encodeTimelineCursor(item) {
  return Buffer.from(JSON.stringify({
    occurred_at: item.occurred_at,
    created_at: item.created_at,
    id: item.id,
  })).toString("base64url");
}

function decodeTimelineCursor(value) {
  assertCondition(typeof value === "string" && value.length <= 512, 400, "INVALID_CURSOR", "分页位置无效。");
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (_error) {
    parsed = null;
  }
  const occurredAt = new Date(parsed?.occurred_at);
  const createdAt = new Date(parsed?.created_at);
  assertCondition(
    parsed && UUID_PATTERN.test(String(parsed.id || ""))
      && !Number.isNaN(occurredAt.getTime())
      && !Number.isNaN(createdAt.getTime()),
    400,
    "INVALID_CURSOR",
    "分页位置无效。",
  );
  return {
    occurred_at: occurredAt.toISOString(),
    created_at: createdAt.toISOString(),
    id: parsed.id,
  };
}

function cursorFilter(cursor, direction) {
  const operator = direction === "newer" ? "gt" : "lt";
  return [
    `occurred_at.${operator}.${cursor.occurred_at}`,
    `and(occurred_at.eq.${cursor.occurred_at},created_at.${operator}.${cursor.created_at})`,
    `and(occurred_at.eq.${cursor.occurred_at},created_at.eq.${cursor.created_at},id.${operator}.${cursor.id})`,
  ].join(",");
}

function orderedTimelineQuery(query, ascending) {
  return query
    .order("occurred_at", { ascending })
    .order("created_at", { ascending })
    .order("id", { ascending });
}

function timelinePage(rows, limit, direction = "older") {
  const hasMore = rows.length > limit;
  const selected = rows.slice(0, limit);
  const items = direction === "newer" ? selected.reverse() : selected;
  return {
    items,
    has_more: hasMore,
    next_cursor: hasMore && items.length
      ? encodeTimelineCursor(direction === "newer" ? items[0] : items[items.length - 1])
      : "",
  };
}

async function requireMoment(supabase, uid, momentId) {
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("id", assertUuid(momentId))
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取人生节点失败。");
  assertCondition(data, 404, "KEY_MOMENT_NOT_FOUND", "人生节点不存在。");
  return data;
}

async function assertOwnedMomentImagePaths(supabase, uid, momentId, paths) {
  if (!paths.length) return;
  const pathPrefix = `users/${uid}/moments/${momentId}/`;
  assertCondition(
    paths.every((path) => path.startsWith(pathPrefix)),
    400,
    "INVALID_IMAGE_PATHS",
    "图片不属于当前人生节点。",
  );
  const objectKeys = paths.map((path) => cosObjectKey(config.keyMomentBucket, path));
  const { data, error } = await supabase
    .from("image_assets")
    .select("object_key")
    .eq("uid", uid)
    .in("object_key", objectKeys);
  throwSupabaseError(error, "校验人生节点图片失败。");
  const ownedKeys = new Set((data || []).map((item) => item.object_key));
  assertCondition(
    objectKeys.every((key) => ownedKeys.has(key)),
    400,
    "INVALID_IMAGE_PATHS",
    "图片不存在或不属于当前账号。",
  );
}

async function signedUrlsFor(supabase, moments) {
  const paths = [...new Set(moments.flatMap((item) => item.image_paths || []).filter(Boolean))];
  return createSignedUrlMap({
    bucketName: config.keyMomentBucket,
    paths,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取人生节点图片失败。",
  });
}

async function toResponses(supabase, moments) {
  const urls = await signedUrlsFor(supabase, moments);
  return moments.map((item) => {
    const imagePaths = Array.isArray(item.image_paths) ? item.image_paths.filter(Boolean) : [];
    return {
      ...item,
      image_paths: imagePaths,
      image_urls: imagePaths.map((path) => urls.get(path) || ""),
      image_count: imagePaths.length,
    };
  });
}

function assertImage(image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择图片。");
  assertCondition(STANDARD_IMAGE_TYPES.has(image.mimetype), 415, "UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG 或 WebP 图片。");
}

async function uploadImage(supabase, uid, momentId, image, replacedPaths = []) {
  assertImage(image);
  const revision = randomUUID();
  const basePath = `users/${uid}/moments/${momentId}/${revision}`;
  return uploadStandardImage(supabase, {
    bucketName: config.keyMomentBucket,
    basePath,
    uid,
    buffer: image.buffer,
    crop: image.crop,
    uploadErrorMessage: "上传人生节点图片失败。",
    replacedPaths,
  });
}

async function removeImages(supabase, uid, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.keyMomentBucket,
    paths,
    uid,
    errorMessage: "删除人生节点图片失败:",
  });
}

export const readKeyMomentMultipart = readMultipartImage;

export async function listKeyMoments(supabase, uid, query) {
  const { start, end } = periodBounds(query);
  const limit = pageSize(query.page_size);
  let request = supabase
    .from("key_moments")
    .select("*")
    .eq("uid", uid)
    .gte("occurred_at", start)
    .lt("occurred_at", end);
  if (query.cursor) {
    request = request.or(cursorFilter(decodeTimelineCursor(query.cursor), "older"));
  }
  const { data, error } = await orderedTimelineQuery(request, false).limit(limit + 1);
  throwSupabaseError(error, "读取人生节点失败。");
  const page = timelinePage(data || [], limit);
  return {
    ...page,
    items: await toResponses(supabase, page.items),
  };
}

export async function readKeyMoment(supabase, uid, momentId) {
  return (await toResponses(supabase, [await requireMoment(supabase, uid, momentId)]))[0];
}

export async function listKeyMomentContext(supabase, uid, momentId, query = {}) {
  const current = await requireMoment(supabase, uid, momentId);
  const limit = pageSize(query.page_size, DETAIL_CONTEXT_SIZE);
  const cursor = {
    occurred_at: new Date(current.occurred_at).toISOString(),
    created_at: new Date(current.created_at).toISOString(),
    id: current.id,
  };
  const baseQuery = () => supabase.from("key_moments").select("*").eq("uid", uid);
  const [newerResult, olderResult] = await Promise.all([
    orderedTimelineQuery(baseQuery().or(cursorFilter(cursor, "newer")), true).limit(limit + 1),
    orderedTimelineQuery(baseQuery().or(cursorFilter(cursor, "older")), false).limit(limit + 1),
  ]);
  throwSupabaseError(newerResult.error, "读取较新的人生节点失败。");
  throwSupabaseError(olderResult.error, "读取较早的人生节点失败。");
  const newer = timelinePage(newerResult.data || [], limit, "newer");
  const older = timelinePage(olderResult.data || [], limit, "older");
  const items = [...newer.items, current, ...older.items];
  return {
    items: await toResponses(supabase, items),
    focus_index: newer.items.length,
    has_newer: newer.has_more,
    has_older: older.has_more,
    newer_cursor: newer.has_more && items.length ? encodeTimelineCursor(items[0]) : "",
    older_cursor: older.has_more && items.length ? encodeTimelineCursor(items[items.length - 1]) : "",
  };
}

export async function listKeyMomentFeed(supabase, uid, query = {}) {
  const direction = query.direction === "newer" ? "newer" : "older";
  assertCondition(query.cursor, 400, "CURSOR_REQUIRED", "缺少人生节点分页位置。");
  const cursor = decodeTimelineCursor(query.cursor);
  const limit = pageSize(query.page_size, DETAIL_CONTEXT_SIZE);
  const request = supabase
    .from("key_moments")
    .select("*")
    .eq("uid", uid)
    .or(cursorFilter(cursor, direction));
  const { data, error } = await orderedTimelineQuery(request, direction === "newer").limit(limit + 1);
  throwSupabaseError(error, direction === "newer" ? "读取较新的人生节点失败。" : "读取较早的人生节点失败。");
  const page = timelinePage(data || [], limit, direction);
  return {
    ...page,
    items: await toResponses(supabase, page.items),
  };
}

async function findMoment(supabase, uid, momentId) {
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("id", assertUuid(momentId))
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取人生节点失败。");
  return data;
}

export async function createKeyMomentDraft(supabase, uid) {
  void cleanupStaleKeyMomentDraftImages(supabase, uid).catch(() => {
    lastDraftCleanupByUid.delete(uid);
  });
  return { id: randomUUID() };
}

export async function stageNewKeyMomentImage(supabase, uid, draftId, image) {
  const id = assertUuid(draftId);
  assertCondition(
    !(await findMoment(supabase, uid, id)),
    409,
    "DRAFT_ALREADY_COMMITTED",
    "这条人生节点已经保存。",
  );
  const paths = await uploadImage(supabase, uid, id, image);
  return { image_path: paths.imagePath };
}

export async function discardNewKeyMomentImages(supabase, uid, draftId, body = {}) {
  const id = assertUuid(draftId);
  const paths = normalizeImagePaths(body.image_paths, "暂存图片列表");
  await assertOwnedMomentImagePaths(supabase, uid, id, paths);
  const committed = await findMoment(supabase, uid, id);
  assertCondition(
    !committed || paths.every((path) => !committed.image_paths.includes(path)),
    400,
    "IMAGE_ALREADY_COMMITTED",
    "已保存的图片不能作为暂存图片清理。",
  );
  await removeImages(supabase, uid, paths);
}

async function cleanupStaleKeyMomentDraftImages(supabase, uid) {
  const now = Date.now();
  const previousCleanup = lastDraftCleanupByUid.get(uid) || 0;
  if (now - previousCleanup < DRAFT_CLEANUP_INTERVAL_MS) return;
  lastDraftCleanupByUid.set(uid, now);

  const cutoff = new Date(now - STALE_DRAFT_AGE_MS).toISOString();
  const { data: assets, error: assetError } = await supabase
    .from("image_assets")
    .select("object_key")
    .eq("uid", uid)
    .eq("module", "key_moments")
    .lt("updated_at", cutoff)
    .limit(DRAFT_CLEANUP_BATCH_SIZE);
  throwSupabaseError(assetError, "检查人生节点暂存图片失败。");
  const objectPrefix = `${config.keyMomentBucket}/`;
  const paths = (assets || [])
    .map((asset) => String(asset.object_key || ""))
    .filter((objectKey) => objectKey.startsWith(objectPrefix))
    .map((objectKey) => objectKey.slice(objectPrefix.length));
  if (!paths.length) return;

  const { data: referencedMoments, error: referenceError } = await supabase
    .from("key_moments")
    .select("image_paths")
    .eq("uid", uid)
    .overlaps("image_paths", paths);
  throwSupabaseError(referenceError, "核对人生节点图片引用失败。");
  const referencedPaths = new Set(
    (referencedMoments || []).flatMap((moment) => moment.image_paths || []),
  );
  await removeImages(supabase, uid, paths.filter((path) => !referencedPaths.has(path)));
}

export async function createKeyMoment(supabase, uid, body) {
  const content = normalizeContent(body.content ?? "");
  const id = body.id === undefined ? randomUUID() : assertUuid(body.id);
  const imagePaths = body.image_paths === undefined
    ? []
    : normalizeImagePaths(body.image_paths);
  assertCondition(content || imagePaths.length, 400, "CONTENT_REQUIRED", "请填写文案或上传图片。");
  if (imagePaths.length) await assertOwnedMomentImagePaths(supabase, uid, id, imagePaths);
  const occurredAt = normalizeOccurredAt(body.occurred_at);
  const { data, error } = await supabase
    .from("key_moments")
    .insert({
      id,
      uid: uid,
      content,
      occurred_at: occurredAt,
      image_paths: imagePaths,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const existing = await findMoment(supabase, uid, id);
      if (
        existing
        && existing.content === content
        && new Date(existing.occurred_at).toISOString() === occurredAt
        && JSON.stringify(existing.image_paths || []) === JSON.stringify(imagePaths)
      ) {
        return (await toResponses(supabase, [existing]))[0];
      }
    }
    throwSupabaseError(error, "新增人生节点失败。");
  }
  return (await toResponses(supabase, [data]))[0];
}

export async function updateKeyMoment(supabase, uid, momentId, body, options = {}) {
  const current = await requireMoment(supabase, uid, momentId);
  const changes = {};
  if (body.content !== undefined) {
    changes.content = normalizeContent(body.content);
    if (changes.content && changes.content !== current.content) {
      await options.checkText?.(changes.content);
    }
  }
  if (body.occurred_at !== undefined) changes.occurred_at = normalizeOccurredAt(body.occurred_at);
  if (body.image_paths !== undefined) {
    changes.image_paths = normalizeImagePaths(body.image_paths);
    await assertOwnedMomentImagePaths(supabase, uid, current.id, changes.image_paths);
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const nextContent = changes.content ?? current.content;
  const nextImagePaths = changes.image_paths ?? current.image_paths;
  assertCondition(
    nextContent || nextImagePaths.length,
    400,
    "CONTENT_REQUIRED",
    "请填写文案或保留图片。",
  );
  const removedPaths = current.image_paths.filter((path) => !nextImagePaths.includes(path));
  const { data, error } = await supabase
    .from("key_moments")
    .update(changes)
    .eq("id", current.id)
    .eq("uid", uid)
    .select("*")
    .single();
  throwSupabaseError(error, "更新人生节点失败。");
  await removeImages(supabase, uid, removedPaths);
  return (await toResponses(supabase, [data]))[0];
}

export async function stageKeyMomentImage(supabase, uid, momentId, image, body = {}) {
  const current = await requireMoment(supabase, uid, momentId);
  const replacedPaths = body.replaced_paths === undefined
    ? []
    : normalizeImagePaths(body.replaced_paths, "待替换图片列表");
  assertCondition(
    replacedPaths.every((path) => current.image_paths.includes(path)),
    400,
    "INVALID_IMAGE_PATHS",
    "待替换图片不属于当前人生节点。",
  );
  const paths = await uploadImage(supabase, uid, current.id, image, replacedPaths);
  return { image_path: paths.imagePath };
}

export async function discardStagedKeyMomentImages(supabase, uid, momentId, body = {}) {
  const current = await requireMoment(supabase, uid, momentId);
  const paths = normalizeImagePaths(body.image_paths, "暂存图片列表");
  await assertOwnedMomentImagePaths(supabase, uid, current.id, paths);
  assertCondition(
    paths.every((path) => !current.image_paths.includes(path)),
    400,
    "IMAGE_ALREADY_COMMITTED",
    "已保存的图片不能作为暂存图片清理。",
  );
  await removeImages(supabase, uid, paths);
}

export async function deleteKeyMoment(supabase, uid, momentId) {
  const current = await requireMoment(supabase, uid, momentId);
  const { error } = await supabase
    .from("key_moments")
    .delete()
    .eq("id", current.id)
    .eq("uid", uid);
  throwSupabaseError(error, "删除人生节点失败。");
  await removeImages(supabase, uid, current.image_paths);
}

import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
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

function assertUuid(value) {
  assertCondition(
    typeof value === "string" && UUID_PATTERN.test(value),
    400,
    "INVALID_ID",
    "关键节点编号无效。",
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

async function requireMoment(supabase, uid, momentId) {
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("id", assertUuid(momentId))
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取关键节点失败。");
  assertCondition(data, 404, "KEY_MOMENT_NOT_FOUND", "关键节点不存在。");
  return data;
}

async function signedUrlsFor(supabase, moments) {
  const paths = [...new Set(moments.flatMap((item) => item.image_paths || []).filter(Boolean))];
  return createSignedUrlMap({
    bucketName: config.keyMomentBucket,
    paths,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取关键节点图片失败。",
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
    uploadErrorMessage: "上传关键节点图片失败。",
    replacedPaths,
  });
}

async function removeImages(supabase, uid, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.keyMomentBucket,
    paths,
    uid,
    errorMessage: "删除关键节点图片失败:",
  });
}

export const readKeyMomentMultipart = readMultipartImage;

export async function listKeyMoments(supabase, uid, query) {
  const { start, end } = periodBounds(query);
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("uid", uid)
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  throwSupabaseError(error, "读取关键节点失败。");
  return toResponses(supabase, data || []);
}

export async function listKeyMomentFeed(supabase, uid, query = {}) {
  const { start, end } = periodBounds({ granularity: "day", date: query.date });
  const baseQuery = () => supabase.from("key_moments").select("*").eq("uid", uid);
  const [newerResult, selectedResult, olderResult] = await Promise.all([
    baseQuery()
      .gte("occurred_at", end)
      .order("occurred_at", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(250),
    baseQuery()
      .gte("occurred_at", start)
      .lt("occurred_at", end)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    baseQuery()
      .lt("occurred_at", start)
      .order("occurred_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250),
  ]);
  throwSupabaseError(newerResult.error, "读取较新的关键节点失败。");
  throwSupabaseError(selectedResult.error, "读取当天关键节点失败。");
  throwSupabaseError(olderResult.error, "读取较早的关键节点失败。");
  return toResponses(supabase, [
    ...(newerResult.data || []).reverse(),
    ...(selectedResult.data || []),
    ...(olderResult.data || []),
  ]);
}

export async function createKeyMoment(supabase, uid, body, image) {
  const content = normalizeContent(body.content ?? "");
  assertCondition(content || image, 400, "CONTENT_REQUIRED", "请填写文案或上传图片。");
  const id = randomUUID();
  const paths = image ? await uploadImage(supabase, uid, id, image) : { imagePath: null };
  const { data, error } = await supabase
    .from("key_moments")
    .insert({
      id,
      uid: uid,
      content,
      occurred_at: normalizeOccurredAt(body.occurred_at),
      image_paths: paths.imagePath ? [paths.imagePath] : [],
    })
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, uid, [paths.imagePath]);
    throwSupabaseError(error, "新增关键节点失败。");
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
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const nextContent = changes.content ?? current.content;
  assertCondition(
    nextContent || current.image_paths.length,
    400,
    "CONTENT_REQUIRED",
    "请填写文案或保留图片。",
  );
  const { data, error } = await supabase
    .from("key_moments")
    .update(changes)
    .eq("id", current.id)
    .eq("uid", uid)
    .select("*")
    .single();
  throwSupabaseError(error, "更新关键节点失败。");
  return (await toResponses(supabase, [data]))[0];
}

export async function appendKeyMomentImage(supabase, uid, momentId, image) {
  const current = await requireMoment(supabase, uid, momentId);
  assertCondition(current.image_paths.length < 9, 400, "IMAGE_LIMIT_REACHED", "最多上传 9 张图片。");
  const paths = await uploadImage(supabase, uid, current.id, image);
  const nextImagePaths = [...current.image_paths, paths.imagePath];
  const { data, error } = await supabase
    .from("key_moments")
    .update({ image_paths: nextImagePaths })
    .eq("id", current.id)
    .eq("uid", uid)
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, uid, [paths.imagePath]);
    throwSupabaseError(error, "添加关键节点图片失败。");
  }
  return (await toResponses(supabase, [data]))[0];
}

export async function deleteKeyMomentImage(supabase, uid, momentId, imageIndex) {
  const current = await requireMoment(supabase, uid, momentId);
  const index = Number(imageIndex);
  assertCondition(
    Number.isInteger(index) && index >= 0 && index < current.image_paths.length,
    400,
    "INVALID_IMAGE_INDEX",
    "图片编号无效。",
  );
  const removedPath = current.image_paths[index];
  const nextImagePaths = current.image_paths.filter((_path, currentIndex) => currentIndex !== index);
  assertCondition(
    current.content.trim() || nextImagePaths.length,
    400,
    "CONTENT_REQUIRED",
    "删除图片前请先填写文案。",
  );
  const { data, error } = await supabase
    .from("key_moments")
    .update({ image_paths: nextImagePaths })
    .eq("id", current.id)
    .eq("uid", uid)
    .select("*")
    .single();
  throwSupabaseError(error, "删除关键节点图片失败。");
  await removeImages(supabase, uid, [removedPath]);
  return (await toResponses(supabase, [data]))[0];
}

export async function deleteKeyMoment(supabase, uid, momentId) {
  const current = await requireMoment(supabase, uid, momentId);
  const { error } = await supabase
    .from("key_moments")
    .delete()
    .eq("id", current.id)
    .eq("uid", uid);
  throwSupabaseError(error, "删除关键节点失败。");
  await removeImages(supabase, uid, current.image_paths);
}

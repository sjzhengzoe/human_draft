import { randomUUID } from "node:crypto";
import { config } from "../config.mjs";
import { assertCondition, HttpError } from "./errors.mjs";
import {
  IMAGE_PROFILES,
  optimizeImage,
  optimizedImagePaths,
} from "./image-processing.mjs";
import { throwSupabaseError } from "./supabase.mjs";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GRANULARITIES = new Set(["year", "month", "day"]);
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;

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
  assertCondition(content.length <= 50, 400, "CONTENT_TOO_LONG", "文案不能超过 50 个字。");
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

async function requireMoment(supabase, userId, momentId) {
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("id", assertUuid(momentId))
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取关键节点失败。");
  assertCondition(data, 404, "KEY_MOMENT_NOT_FOUND", "关键节点不存在。");
  return data;
}

async function signedUrlsFor(supabase, moments) {
  const paths = [...new Set(moments.flatMap((item) => [item.image_path, item.thumbnail_path]).filter(Boolean))];
  if (!paths.length) return new Map();
  const { data, error } = await supabase.storage
    .from(config.keyMomentBucket)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    const wrapped = new HttpError(500, "IMAGE_URL_FAILED", "读取关键节点图片失败。");
    wrapped.cause = error;
    throw wrapped;
  }
  return new Map((data || []).map((item, index) => [item.path || paths[index], item.signedUrl || ""]));
}

async function toResponses(supabase, moments) {
  const urls = await signedUrlsFor(supabase, moments);
  return moments.map((item) => ({
    ...item,
    image_url: item.image_path ? urls.get(item.image_path) || "" : "",
    thumbnail_url:
      (item.thumbnail_path ? urls.get(item.thumbnail_path) || "" : "") ||
      (item.image_path ? urls.get(item.image_path) || "" : ""),
  }));
}

async function normalizeImage(image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择图片。");
  assertCondition(ALLOWED_IMAGE_TYPES.has(image.mimetype), 415, "UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG 或 WebP 图片。");
  try {
    return await optimizeImage(image.buffer, IMAGE_PROFILES.keyMoment);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。");
    wrapped.cause = error;
    throw wrapped;
  }
}

async function uploadImage(supabase, userId, momentId, image) {
  const { original, thumbnail, originalContentType, thumbnailContentType } =
    await normalizeImage(image);
  const revision = randomUUID();
  const basePath = `users/${userId}/moments/${momentId}/${revision}`;
  const { imagePath, thumbnailPath } = optimizedImagePaths(basePath);
  const bucket = supabase.storage.from(config.keyMomentBucket);
  const { error: imageError } = await bucket.upload(imagePath, original, {
    cacheControl: "31536000",
    contentType: originalContentType,
    upsert: false,
  });
  if (imageError) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", "上传关键节点图片失败。");
    wrapped.cause = imageError;
    throw wrapped;
  }
  const { error: thumbnailError } = await bucket.upload(thumbnailPath, thumbnail, {
    cacheControl: "31536000",
    contentType: thumbnailContentType,
    upsert: false,
  });
  if (thumbnailError) {
    await bucket.remove([imagePath]);
    const wrapped = new HttpError(500, "THUMBNAIL_UPLOAD_FAILED", "生成关键节点缩略图失败。");
    wrapped.cause = thumbnailError;
    throw wrapped;
  }
  return { imagePath, thumbnailPath };
}

async function removeImages(supabase, paths) {
  const valid = paths.filter(Boolean);
  if (!valid.length) return;
  const { error } = await supabase.storage.from(config.keyMomentBucket).remove(valid);
  if (error) console.error("删除关键节点图片失败:", error);
}

export async function readKeyMomentMultipart(request) {
  const fields = {};
  let image;
  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "image") {
        part.file.resume();
        continue;
      }
      assertCondition(!image, 400, "MULTIPLE_IMAGES", "一次只能上传一张图片。");
      assertCondition(ALLOWED_IMAGE_TYPES.has(part.mimetype), 415, "UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG 或 WebP 图片。");
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      assertCondition(!part.file.truncated, 413, "IMAGE_TOO_LARGE", "图片文件过大。");
      image = { buffer: Buffer.concat(chunks), mimetype: part.mimetype, filename: part.filename };
    } else {
      fields[part.fieldname] = String(part.value ?? "").trim();
    }
  }
  return { fields, image };
}

export async function listKeyMoments(supabase, userId, query) {
  const { start, end } = periodBounds(query);
  const { data, error } = await supabase
    .from("key_moments")
    .select("*")
    .eq("user_id", userId)
    .gte("occurred_at", start)
    .lt("occurred_at", end)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);
  throwSupabaseError(error, "读取关键节点失败。");
  return toResponses(supabase, data || []);
}

export async function createKeyMoment(supabase, userId, body, image) {
  const content = normalizeContent(body.content ?? "");
  assertCondition(content || image, 400, "CONTENT_REQUIRED", "请填写文案或上传图片。");
  const id = randomUUID();
  const paths = image ? await uploadImage(supabase, userId, id, image) : { imagePath: null, thumbnailPath: null };
  const { data, error } = await supabase
    .from("key_moments")
    .insert({
      id,
      user_id: userId,
      content,
      occurred_at: normalizeOccurredAt(body.occurred_at),
      image_path: paths.imagePath,
      thumbnail_path: paths.thumbnailPath,
    })
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "新增关键节点失败。");
  }
  return (await toResponses(supabase, [data]))[0];
}

export async function updateKeyMoment(supabase, userId, momentId, body, options = {}) {
  const current = await requireMoment(supabase, userId, momentId);
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
  assertCondition(nextContent || current.image_path, 400, "CONTENT_REQUIRED", "请填写文案或保留图片。");
  const { data, error } = await supabase
    .from("key_moments")
    .update(changes)
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新关键节点失败。");
  return (await toResponses(supabase, [data]))[0];
}

export async function replaceKeyMomentImage(supabase, userId, momentId, image) {
  const current = await requireMoment(supabase, userId, momentId);
  const paths = await uploadImage(supabase, userId, current.id, image);
  const { data, error } = await supabase
    .from("key_moments")
    .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "更新关键节点图片失败。");
  }
  await removeImages(supabase, [current.image_path, current.thumbnail_path]);
  return (await toResponses(supabase, [data]))[0];
}

export async function deleteKeyMomentImage(supabase, userId, momentId) {
  const current = await requireMoment(supabase, userId, momentId);
  assertCondition(current.content.trim(), 400, "CONTENT_REQUIRED", "删除图片前请先填写文案。");
  const { data, error } = await supabase
    .from("key_moments")
    .update({ image_path: null, thumbnail_path: null })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "删除关键节点图片失败。");
  await removeImages(supabase, [current.image_path, current.thumbnail_path]);
  return (await toResponses(supabase, [data]))[0];
}

export async function deleteKeyMoment(supabase, userId, momentId) {
  const current = await requireMoment(supabase, userId, momentId);
  const { error } = await supabase
    .from("key_moments")
    .delete()
    .eq("id", current.id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除关键节点失败。");
  await removeImages(supabase, [current.image_path, current.thumbnail_path]);
}

import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { assertCondition } from "../../lib/errors.mjs";
import { IMAGE_PROFILES } from "../../lib/image-processing.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  readMultipartImage,
  STANDARD_IMAGE_TYPES,
} from "../../http/multipart-image.mjs";
import {
  createSignedUrlMap,
  removeStorageImages,
  USER_IMAGE_SIGNED_URL_TTL_SECONDS,
  uploadOptimizedImagePair,
} from "../shared/image-storage.mjs";
import {
  enumValue,
  nextSortOrder,
  requiredText,
  requireRecord,
  UUID_PATTERN,
} from "../shared/records.mjs";

export const ACTIVITY_TYPES = ["室内", "户外", "居家"];
const ACTIVITY_INTRODUCTION_MAX_LENGTH = 12;

function activityIntroductionText(value) {
  if (typeof value !== "string") return "";
  return Array.from(value.trim()).slice(0, ACTIVITY_INTRODUCTION_MAX_LENGTH).join("");
}

function introductionValue(value) {
  assertCondition(typeof value === "string", 400, "INVALID_TEXT", "一句简介格式无效。");
  const introduction = value.trim();
  assertCondition(
    Array.from(introduction).length <= ACTIVITY_INTRODUCTION_MAX_LENGTH,
    400,
    "TEXT_TOO_LONG",
    `一句简介不能超过 ${ACTIVITY_INTRODUCTION_MAX_LENGTH} 个字。`,
  );
  return introduction;
}

function activityImageUrl(urls, path) {
  if (!path) return "";
  return urls.get(path) || "";
}

function toActivityResponse(item, imageUrls = new Map()) {
  return {
    ...item,
    introduction: activityIntroductionText(item.introduction),
    image_url: activityImageUrl(imageUrls, item.image_path),
    thumbnail_url: activityImageUrl(
      imageUrls,
      item.thumbnail_path || item.image_path,
    ),
  };
}

async function toSignedActivityResponse(supabase, item) {
  const imageUrls = await createSignedUrlMap(supabase, {
    bucketName: config.activityBucket,
    paths: [item.image_path, item.thumbnail_path],
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取活动封面失败。",
  });
  return toActivityResponse(item, imageUrls);
}

function assertActivityImage(image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择活动封面。");
  assertCondition(
    STANDARD_IMAGE_TYPES.has(image.mimetype),
    415,
    "UNSUPPORTED_IMAGE_TYPE",
    "仅支持 PNG、JPEG 或 WebP 图片。",
  );
}

async function uploadActivityImage(supabase, userId, itemId, image) {
  assertActivityImage(image);
  return uploadOptimizedImagePair(supabase, {
    bucketName: config.activityBucket,
    basePath: `users/${userId}/activities/${itemId}/${randomUUID()}`,
    buffer: image.buffer,
    profile: IMAGE_PROFILES.activity,
    uploadErrorMessage: "上传活动封面失败。",
    thumbnailErrorMessage: "生成活动封面缩略图失败。",
  });
}

async function removeActivityImages(supabase, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.activityBucket,
    paths,
    errorMessage: "删除活动封面失败:",
  });
}

export const readActivityMultipart = readMultipartImage;

export async function listActivityItems(supabase, userId, query) {
  const includeAllTypes = query.all_types === "true";
  const activityType = includeAllTypes
    ? ""
    : query.activity_type
      ? enumValue(query.activity_type, ACTIVITY_TYPES, "活动分类")
      : ACTIVITY_TYPES[0];
  let request = supabase
    .from("activity_items")
    .select("*")
    .eq("user_id", userId);
  if (activityType) request = request.eq("activity_type", activityType);
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("name", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取活动清单失败。");
  const imageUrls = await createSignedUrlMap(supabase, {
    bucketName: config.activityBucket,
    paths: (data || []).flatMap((item) => [item.image_path, item.thumbnail_path]),
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取活动封面失败。",
  });
  return (data || []).map((item) => toActivityResponse(item, imageUrls));
}

export async function createActivityItem(supabase, userId, body, image) {
  const activityType = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
  const name = requiredText(body.name, "活动名称");
  const introduction = introductionValue(body.introduction ?? "");
  const sortOrder = await nextSortOrder(supabase, userId, "activity_items", {
    activity_type: activityType,
  });
  const id = randomUUID();
  const paths = image
    ? await uploadActivityImage(supabase, userId, id, image)
    : { imagePath: null, thumbnailPath: null };
  const { data, error } = await supabase
    .from("activity_items")
    .insert({
      id,
      user_id: userId,
      name,
      introduction,
      activity_type: activityType,
      image_path: paths.imagePath,
      thumbnail_path: paths.thumbnailPath,
      sort_order: sortOrder,
    })
    .select("*")
    .single();
  if (error) {
    await removeActivityImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "新增活动失败。");
  }
  return toSignedActivityResponse(supabase, data);
}

export async function updateActivityItem(supabase, userId, id, body) {
  const existing = await requireRecord(
    supabase,
    userId,
    "activity_items",
    id,
    "id, activity_type",
  );
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "活动名称");
  if (body.introduction !== undefined) {
    changes.introduction = introductionValue(body.introduction);
  }
  if (body.activity_type !== undefined) {
    changes.activity_type = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
    if (changes.activity_type !== existing.activity_type) {
      changes.sort_order = await nextSortOrder(supabase, userId, "activity_items", {
        activity_type: changes.activity_type,
      });
    }
  }
  assertCondition(
    Object.keys(changes).length > 0,
    400,
    "NO_CHANGES",
    "没有需要更新的内容。",
  );
  const { data, error } = await supabase
    .from("activity_items")
    .update(changes)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新活动失败。");
  return toSignedActivityResponse(supabase, data);
}

export async function replaceActivityItemImage(supabase, userId, id, image) {
  const current = await requireRecord(
    supabase,
    userId,
    "activity_items",
    id,
    "id, image_path, thumbnail_path",
  );
  const previousPaths = [current.image_path, current.thumbnail_path];
  const paths = await uploadActivityImage(supabase, userId, current.id, image);
  const { data, error } = await supabase
    .from("activity_items")
    .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) {
    await removeActivityImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "更新活动封面失败。");
  }
  await removeActivityImages(supabase, previousPaths);
  return toSignedActivityResponse(supabase, data);
}

export async function deleteActivityItem(supabase, userId, id) {
  const current = await requireRecord(
    supabase,
    userId,
    "activity_items",
    id,
    "id, image_path, thumbnail_path",
  );
  const { error } = await supabase
    .from("activity_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除活动失败。");
  await removeActivityImages(supabase, [current.image_path, current.thumbnail_path]);
}

export async function swapActivityItemSortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId) && sourceId !== targetId,
    400,
    "INVALID_IDS",
    "请选择两个不同的活动项目。",
  );
  const { error } = await supabase.rpc("swap_activity_item_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整活动排序失败。", {
    P0002: {
      statusCode: 404,
      code: "ACTIVITY_ITEM_NOT_FOUND",
      message: "活动项目不存在。",
    },
    "22023": {
      statusCode: 400,
      code: "INVALID_ACTIVITY_SWAP",
      message: "只能交换同一分类下的活动。",
    },
  });
  return { updated: 2 };
}

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config.mjs";
import { assertCondition, HttpError } from "./errors.mjs";
import { throwSupabaseError } from "./supabase.mjs";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const DUPLICATE_CATEGORY_ERROR = {
  23505: {
    statusCode: 409,
    code: "DUPLICATE_CATEGORY",
    message: "已经存在同名分类。",
  },
};

function requiredText(value, fieldName, maxLength) {
  assertCondition(
    typeof value === "string" && value.trim().length > 0,
    400,
    "TEXT_REQUIRED",
    `请填写${fieldName}。`,
  );
  const text = value.trim();
  assertCondition(
    text.length <= maxLength,
    400,
    "TEXT_TOO_LONG",
    `${fieldName}不能超过 ${maxLength} 个字符。`,
  );
  return text;
}

function assertUuid(value, fieldName) {
  assertCondition(
    typeof value === "string" && UUID_PATTERN.test(value),
    400,
    "INVALID_ID",
    `${fieldName}无效。`,
  );
  return value;
}

function normalizeFields(value, currentFields = []) {
  assertCondition(Array.isArray(value), 400, "INVALID_FIELDS", "分类属性格式无效。");
  assertCondition(value.length <= 30, 400, "TOO_MANY_FIELDS", "每个分类最多添加 30 个属性。");

  const currentById = new Map(currentFields.map((field) => [field.id, field]));
  const ids = new Set();
  const names = new Set();

  return value.map((field) => {
    assertCondition(
      field && typeof field === "object" && !Array.isArray(field),
      400,
      "INVALID_FIELD",
      "分类属性格式无效。",
    );
    const name = requiredText(field.name, "属性名称", 40);
    const normalizedName = name.toLocaleLowerCase("zh-CN");
    assertCondition(!names.has(normalizedName), 400, "DUPLICATE_FIELD", `属性“${name}”重复了。`);
    names.add(normalizedName);

    let id = randomUUID();
    if (field.id !== undefined && field.id !== "") {
      id = assertUuid(field.id, "属性编号");
      assertCondition(
        currentById.has(id),
        400,
        "UNKNOWN_FIELD",
        `属性“${name}”不属于当前分类。`,
      );
    }
    assertCondition(!ids.has(id), 400, "DUPLICATE_FIELD_ID", "分类属性编号重复。");
    ids.add(id);
    return { id, name };
  });
}

function parseValues(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    throw new HttpError(400, "INVALID_VALUES", "衣物属性格式无效。");
  }
}

function normalizeValues(value, fields) {
  const parsed = parseValues(value ?? {});
  assertCondition(
    parsed && typeof parsed === "object" && !Array.isArray(parsed),
    400,
    "INVALID_VALUES",
    "衣物属性格式无效。",
  );
  const allowedIds = new Set(fields.map((field) => field.id));
  const result = {};

  Object.entries(parsed).forEach(([fieldId, fieldValue]) => {
    assertCondition(allowedIds.has(fieldId), 400, "UNKNOWN_FIELD", "衣物属性不属于所选分类。");
    assertCondition(typeof fieldValue === "string", 400, "INVALID_VALUE", "衣物属性值必须是文字。");
    const text = fieldValue.trim();
    assertCondition(text.length <= 120, 400, "VALUE_TOO_LONG", "单个衣物属性不能超过 120 个字符。");
    if (text) result[fieldId] = text;
  });
  return result;
}

async function requireCategory(supabase, userId, categoryId) {
  assertUuid(categoryId, "分类编号");
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取衣物分类失败。");
  assertCondition(data, 404, "WARDROBE_CATEGORY_NOT_FOUND", "衣物分类不存在。");
  return data;
}

async function requireItem(supabase, userId, itemId) {
  assertUuid(itemId, "衣物编号");
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取衣物失败。");
  assertCondition(data, 404, "WARDROBE_ITEM_NOT_FOUND", "衣物不存在。");
  return data;
}

async function signedUrlFor(supabase, path) {
  if (!path) return "";
  const { data, error } = await supabase.storage
    .from(config.wardrobeBucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) {
    const wrapped = new HttpError(500, "IMAGE_URL_FAILED", "读取衣物图片失败。");
    wrapped.cause = error;
    throw wrapped;
  }
  return data?.signedUrl || "";
}

async function signedUrlsFor(supabase, paths) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();
  const { data, error } = await supabase.storage
    .from(config.wardrobeBucket)
    .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    const wrapped = new HttpError(500, "IMAGE_URL_FAILED", "读取衣物图片失败。");
    wrapped.cause = error;
    throw wrapped;
  }
  return new Map(
    (data || []).map((item, index) => [item.path || uniquePaths[index], item.signedUrl || ""]),
  );
}

async function toItemResponse(supabase, item, category, signedUrls) {
  const thumbnailPath = item.thumbnail_path || item.image_path;
  const [imageUrl, thumbnailUrl] = signedUrls
    ? [signedUrls.get(item.image_path) || "", signedUrls.get(thumbnailPath) || ""]
    : await Promise.all([
        signedUrlFor(supabase, item.image_path),
        signedUrlFor(supabase, thumbnailPath),
      ]);
  return {
    ...item,
    category: category
      ? { id: category.id, name: category.name, fields: category.fields }
      : null,
    image_url: imageUrl,
    thumbnail_url: thumbnailUrl,
  };
}

async function normalizeImage(buffer) {
  try {
    const source = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await source.metadata();
    assertCondition(metadata.width && metadata.height, 400, "INVALID_IMAGE", "无法读取图片尺寸。");
    const original = await source.clone().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
    const thumbnail = await source
      .clone()
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();
    return { original, thumbnail };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。");
    wrapped.cause = error;
    throw wrapped;
  }
}

async function uploadImagePair(supabase, userId, itemId, image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择衣物图片。");
  assertCondition(ALLOWED_IMAGE_TYPES.has(image.mimetype), 415, "UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG 或 WebP 图片。");
  const revision = randomUUID();
  const basePath = `users/${userId}/items/${itemId}/${revision}`;
  const imagePath = `${basePath}-original.png`;
  const thumbnailPath = `${basePath}-thumbnail.webp`;
  const { original, thumbnail } = await normalizeImage(image.buffer);
  const bucket = supabase.storage.from(config.wardrobeBucket);

  const { error: originalError } = await bucket.upload(imagePath, original, {
    cacheControl: "31536000",
    contentType: "image/png",
    upsert: false,
  });
  if (originalError) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", "上传衣物图片失败。");
    wrapped.cause = originalError;
    throw wrapped;
  }

  const { error: thumbnailError } = await bucket.upload(thumbnailPath, thumbnail, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: false,
  });
  if (thumbnailError) {
    await bucket.remove([imagePath]);
    const wrapped = new HttpError(500, "THUMBNAIL_UPLOAD_FAILED", "生成衣物缩略图失败。");
    wrapped.cause = thumbnailError;
    throw wrapped;
  }
  return { imagePath, thumbnailPath };
}

async function removeImages(supabase, paths) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;
  const { error } = await supabase.storage.from(config.wardrobeBucket).remove(validPaths);
  if (error) console.error("删除衣物图片失败:", error);
}

export async function listWardrobeCategories(supabase, userId) {
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  throwSupabaseError(error, "读取衣物分类失败。");
  return data;
}

export async function getWardrobeStats(supabase, userId) {
  const now = new Date();
  const shanghaiNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const monthStart = new Date(
    Date.UTC(shanghaiNow.getUTCFullYear(), shanghaiNow.getUTCMonth(), 1) -
      8 * 60 * 60 * 1000,
  ).toISOString();
  const [categoryResult, itemResult, monthlyItemResult] = await Promise.all([
    supabase
      .from("wardrobe_categories")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart),
  ]);
  throwSupabaseError(categoryResult.error, "统计衣物分类失败。");
  throwSupabaseError(itemResult.error, "统计衣物失败。");
  throwSupabaseError(monthlyItemResult.error, "统计本月新增衣物失败。");
  return {
    total_items: itemResult.count || 0,
    total_categories: categoryResult.count || 0,
    monthly_items: monthlyItemResult.count || 0,
  };
}

export async function getWardrobeCategory(supabase, userId, categoryId) {
  return requireCategory(supabase, userId, categoryId);
}

export async function createWardrobeCategory(supabase, userId, body) {
  const fields = normalizeFields(body.fields || []);
  const { data, error } = await supabase
    .rpc("create_wardrobe_category_at_end", {
      p_user_id: userId,
      p_name: requiredText(body.name, "分类名称", 40),
      p_fields: fields,
    })
    .single();
  throwSupabaseError(error, "新增衣物分类失败。", DUPLICATE_CATEGORY_ERROR);
  return data;
}

export async function updateWardrobeCategory(supabase, userId, categoryId, body) {
  const current = await requireCategory(supabase, userId, categoryId);
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "分类名称", 40);
  if (body.fields !== undefined) changes.fields = normalizeFields(body.fields, current.fields || []);
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .update(changes)
    .eq("id", categoryId)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新衣物分类失败。", DUPLICATE_CATEGORY_ERROR);
  return data;
}

export async function deleteWardrobeCategory(supabase, userId, categoryId) {
  await requireCategory(supabase, userId, categoryId);
  const { data: items, error: itemError } = await supabase
    .from("wardrobe_items")
    .select("id")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .limit(1);
  throwSupabaseError(itemError, "检查分类衣物失败。");
  assertCondition(!items.length, 409, "CATEGORY_NOT_EMPTY", "该分类下还有衣物，请先移动或删除衣物。");
  const { error } = await supabase
    .from("wardrobe_categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除衣物分类失败。", {
    23503: {
      statusCode: 409,
      code: "CATEGORY_NOT_EMPTY",
      message: "该分类下还有衣物，请先移动或删除衣物。",
    },
  });
}

export async function swapWardrobeCategorySortOrders(supabase, userId, body) {
  const sourceId = assertUuid(body.source_id, "来源分类");
  const targetId = assertUuid(body.target_id, "目标分类");
  assertCondition(sourceId !== targetId, 400, "DUPLICATE_IDS", "请选择两个不同的分类。");
  const { error } = await supabase.rpc("swap_wardrobe_category_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整分类顺序失败。", {
    P0002: {
      statusCode: 404,
      code: "WARDROBE_CATEGORY_NOT_FOUND",
      message: "衣物分类不存在。",
    },
    22023: {
      statusCode: 400,
      code: "INVALID_CATEGORY_SWAP",
      message: "请选择两个不同的分类。",
    },
  });
  return { updated: 2 };
}

export async function listWardrobeItems(supabase, userId, query) {
  const categories = await listWardrobeCategories(supabase, userId);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  let request = supabase.from("wardrobe_items").select("*").eq("user_id", userId);
  if (query.category_id) {
    const categoryId = assertUuid(query.category_id, "分类编号");
    assertCondition(categoryMap.has(categoryId), 404, "WARDROBE_CATEGORY_NOT_FOUND", "衣物分类不存在。");
    request = request.eq("category_id", categoryId);
  }
  if (query.sort === "created_asc") {
    request = request.order("created_at", { ascending: true });
  } else if (query.sort === "created_desc") {
    request = request.order("created_at", { ascending: false });
  } else {
    request = request.order("sort_order", { ascending: true }).order("created_at", { ascending: false });
  }
  const { data, error } = await request.limit(500);
  throwSupabaseError(error, "读取衣橱失败。");
  const signedUrls = await signedUrlsFor(
    supabase,
    data.flatMap((item) => [item.image_path, item.thumbnail_path || item.image_path]),
  );
  return Promise.all(
    data.map((item) =>
      toItemResponse(supabase, item, categoryMap.get(item.category_id), signedUrls),
    ),
  );
}

export async function getWardrobeItem(supabase, userId, itemId) {
  const item = await requireItem(supabase, userId, itemId);
  const category = await requireCategory(supabase, userId, item.category_id);
  return toItemResponse(supabase, item, category);
}

export async function createWardrobeItem(supabase, userId, fields, image) {
  const category = await requireCategory(supabase, userId, fields.category_id);
  const name = requiredText(fields.name, "衣物名称", 80);
  const values = normalizeValues(fields.values || {}, category.fields || []);
  const itemId = randomUUID();
  const paths = await uploadImagePair(supabase, userId, itemId, image);
  const { data, error } = await supabase
    .rpc("create_wardrobe_item_at_end", {
      p_id: itemId,
      p_user_id: userId,
      p_category_id: category.id,
      p_name: name,
      p_image_path: paths.imagePath,
      p_thumbnail_path: paths.thumbnailPath,
      p_values: values,
    })
    .single();
  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "新增衣物失败。");
  }
  return toItemResponse(supabase, data, category);
}

export async function updateWardrobeItem(supabase, userId, itemId, body) {
  const current = await requireItem(supabase, userId, itemId);
  const categoryId = body.category_id ?? current.category_id;
  const category = await requireCategory(supabase, userId, categoryId);
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "衣物名称", 80);
  if (body.category_id !== undefined) changes.category_id = category.id;
  if (body.values !== undefined) {
    const nextValues = { ...(current.values || {}) };
    (category.fields || []).forEach((field) => delete nextValues[field.id]);
    Object.assign(nextValues, normalizeValues(body.values, category.fields || []));
    changes.values = nextValues;
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update(changes)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新衣物失败。");
  return toItemResponse(supabase, data, category);
}

export async function replaceWardrobeItemImage(supabase, userId, itemId, image) {
  const current = await requireItem(supabase, userId, itemId);
  const category = await requireCategory(supabase, userId, current.category_id);
  const paths = await uploadImagePair(supabase, userId, itemId, image);
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "更新衣物图片失败。");
  }
  await removeImages(supabase, [current.image_path, current.thumbnail_path]);
  return toItemResponse(supabase, data, category);
}

export async function deleteWardrobeItem(supabase, userId, itemId) {
  const item = await requireItem(supabase, userId, itemId);
  const { error } = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除衣物失败。");
  await removeImages(supabase, [item.image_path, item.thumbnail_path]);
}

export async function swapWardrobeItemSortOrders(supabase, userId, body) {
  const sourceId = assertUuid(body.source_id, "来源衣物");
  const targetId = assertUuid(body.target_id, "目标衣物");
  assertCondition(sourceId !== targetId, 400, "DUPLICATE_IDS", "请选择两件不同的衣物。");
  const { error } = await supabase.rpc("swap_wardrobe_item_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整衣物顺序失败。", {
    P0002: {
      statusCode: 404,
      code: "WARDROBE_ITEM_NOT_FOUND",
      message: "衣物不存在。",
    },
    22023: {
      statusCode: 400,
      code: "INVALID_ITEM_SWAP",
      message: "请选择两件不同的衣物。",
    },
  });
  return { updated: 2 };
}

export async function reorderWardrobeItems(supabase, userId, body) {
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => assertUuid(id, "衣物")) : [];
  assertCondition(ids.length > 0 && ids.length <= 500, 400, "INVALID_IDS", "排序列表不能为空。" );
  assertCondition(new Set(ids).size === ids.length, 400, "DUPLICATE_IDS", "排序列表包含重复衣物。" );
  const { error } = await supabase.rpc("reorder_wardrobe_items", {
    p_user_id: userId,
    p_item_ids: ids,
  });
  throwSupabaseError(error, "调整衣物顺序失败。");
  return { updated: ids.length };
}

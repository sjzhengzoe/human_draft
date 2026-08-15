import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { assertCondition, HttpError } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { STANDARD_IMAGE_TYPES } from "../../http/multipart-image.mjs";
import { requiredText, UUID_PATTERN } from "../shared/records.mjs";
import {
  createSignedUrlMap,
  removeStorageImages,
  uploadStandardImage,
} from "../shared/image-storage.mjs";

const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const DUPLICATE_CATEGORY_ERROR = {
  23505: {
    statusCode: 409,
    code: "DUPLICATE_CATEGORY",
    message: "已经存在同名分类。",
  },
};

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

async function requireCategory(supabase, uid, categoryId) {
  assertUuid(categoryId, "分类编号");
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .select("*")
    .eq("id", categoryId)
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取衣物分类失败。");
  assertCondition(data, 404, "WARDROBE_CATEGORY_NOT_FOUND", "衣物分类不存在。");
  return data;
}

async function requireItem(supabase, uid, itemId) {
  assertUuid(itemId, "衣物编号");
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("*")
    .eq("id", itemId)
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取衣物失败。");
  assertCondition(data, 404, "WARDROBE_ITEM_NOT_FOUND", "衣物不存在。");
  return data;
}

async function signedUrlFor(supabase, path) {
  if (!path) return "";
  const urls = await signedUrlsFor(supabase, [path]);
  return urls.get(path) || "";
}

async function signedUrlsFor(supabase, paths) {
  return createSignedUrlMap({
    bucketName: config.wardrobeBucket,
    paths,
    expiresIn: SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取衣物图片失败。",
  });
}

async function toItemResponse(supabase, item, category, signedUrls) {
  const imageUrl = signedUrls
    ? signedUrls.get(item.image_path) || ""
    : await signedUrlFor(supabase, item.image_path);
  return {
    ...item,
    category: category
      ? { id: category.id, name: category.name, fields: category.fields }
      : null,
    image_url: imageUrl,
  };
}

async function uploadImage(supabase, uid, itemId, image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择衣物图片。");
  assertCondition(STANDARD_IMAGE_TYPES.has(image.mimetype), 415, "UNSUPPORTED_IMAGE_TYPE", "仅支持 PNG、JPEG 或 WebP 图片。");
  const revision = randomUUID();
  const basePath = `users/${uid}/items/${itemId}/${revision}`;
  return uploadStandardImage(supabase, {
    bucketName: config.wardrobeBucket,
    basePath,
    uid,
    buffer: image.buffer,
    crop: image.crop,
    uploadErrorMessage: "上传衣物图片失败。",
  });
}

async function removeImages(supabase, uid, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.wardrobeBucket,
    paths,
    uid,
    errorMessage: "删除衣物图片失败:",
  });
}

export async function listWardrobeCategories(supabase, uid) {
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .select("*")
    .eq("uid", uid)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  throwSupabaseError(error, "读取衣物分类失败。");
  return data;
}

export async function getWardrobeStats(supabase, uid) {
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
      .eq("uid", uid),
    supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("uid", uid),
    supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("uid", uid)
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

export async function getWardrobeCategory(supabase, uid, categoryId) {
  return requireCategory(supabase, uid, categoryId);
}

export async function createWardrobeCategory(supabase, uid, body) {
  const fields = normalizeFields(body.fields || []);
  const { data, error } = await supabase
    .rpc("create_wardrobe_category_at_end", {
      p_uid: uid,
      p_name: requiredText(body.name, "分类名称", 40),
      p_fields: fields,
    })
    .single();
  throwSupabaseError(error, "新增衣物分类失败。", DUPLICATE_CATEGORY_ERROR);
  return data;
}

export async function updateWardrobeCategory(supabase, uid, categoryId, body) {
  const current = await requireCategory(supabase, uid, categoryId);
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "分类名称", 40);
  if (body.fields !== undefined) changes.fields = normalizeFields(body.fields, current.fields || []);
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const { data, error } = await supabase
    .from("wardrobe_categories")
    .update(changes)
    .eq("id", categoryId)
    .eq("uid", uid)
    .select("*")
    .single();
  throwSupabaseError(error, "更新衣物分类失败。", DUPLICATE_CATEGORY_ERROR);
  return data;
}

export async function deleteWardrobeCategory(supabase, uid, categoryId) {
  await requireCategory(supabase, uid, categoryId);
  const { data: items, error: itemError } = await supabase
    .from("wardrobe_items")
    .select("id")
    .eq("uid", uid)
    .eq("category_id", categoryId)
    .limit(1);
  throwSupabaseError(itemError, "检查分类衣物失败。");
  assertCondition(!items.length, 409, "CATEGORY_NOT_EMPTY", "该分类下还有衣物，请先移动或删除衣物。");
  const { error } = await supabase
    .from("wardrobe_categories")
    .delete()
    .eq("id", categoryId)
    .eq("uid", uid);
  throwSupabaseError(error, "删除衣物分类失败。", {
    23503: {
      statusCode: 409,
      code: "CATEGORY_NOT_EMPTY",
      message: "该分类下还有衣物，请先移动或删除衣物。",
    },
  });
}

export async function swapWardrobeCategorySortOrders(supabase, uid, body) {
  const sourceId = assertUuid(body.source_id, "来源分类");
  const targetId = assertUuid(body.target_id, "目标分类");
  assertCondition(sourceId !== targetId, 400, "DUPLICATE_IDS", "请选择两个不同的分类。");
  const { error } = await supabase.rpc("swap_wardrobe_category_sort_orders", {
    p_uid: uid,
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

export async function listWardrobeItems(supabase, uid, query) {
  const categories = await listWardrobeCategories(supabase, uid);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  let request = supabase.from("wardrobe_items").select("*").eq("uid", uid);
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
    data.map((item) => item.image_path),
  );
  return Promise.all(
    data.map((item) =>
      toItemResponse(supabase, item, categoryMap.get(item.category_id), signedUrls),
    ),
  );
}

export async function getWardrobeItem(supabase, uid, itemId) {
  const item = await requireItem(supabase, uid, itemId);
  const category = await requireCategory(supabase, uid, item.category_id);
  return toItemResponse(supabase, item, category);
}

export async function createWardrobeItem(supabase, uid, fields, image) {
  const category = await requireCategory(supabase, uid, fields.category_id);
  const name = requiredText(fields.name, "衣物名称", 80);
  const values = normalizeValues(fields.values || {}, category.fields || []);
  const itemId = randomUUID();
  const paths = await uploadImage(supabase, uid, itemId, image);
  const { data, error } = await supabase
    .rpc("create_wardrobe_item_at_end", {
      p_id: itemId,
      p_uid: uid,
      p_category_id: category.id,
      p_name: name,
      p_image_path: paths.imagePath,
      p_values: values,
    })
    .single();
  if (error) {
    await removeImages(supabase, uid, [paths.imagePath]);
    throwSupabaseError(error, "新增衣物失败。");
  }
  return toItemResponse(supabase, data, category);
}

export async function updateWardrobeItem(supabase, uid, itemId, body) {
  const current = await requireItem(supabase, uid, itemId);
  const categoryId = body.category_id ?? current.category_id;
  const category = await requireCategory(supabase, uid, categoryId);
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
    .eq("uid", uid)
    .select("*")
    .single();
  throwSupabaseError(error, "更新衣物失败。");
  return toItemResponse(supabase, data, category);
}

export async function replaceWardrobeItemImage(supabase, uid, itemId, image) {
  const current = await requireItem(supabase, uid, itemId);
  const category = await requireCategory(supabase, uid, current.category_id);
  const paths = await uploadImage(supabase, uid, itemId, image);
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update({ image_path: paths.imagePath })
    .eq("id", itemId)
    .eq("uid", uid)
    .select("*")
    .single();
  if (error) {
    await removeImages(supabase, uid, [paths.imagePath]);
    throwSupabaseError(error, "更新衣物图片失败。");
  }
  await removeImages(supabase, uid, [current.image_path]);
  return toItemResponse(supabase, data, category);
}

export async function deleteWardrobeItem(supabase, uid, itemId) {
  const item = await requireItem(supabase, uid, itemId);
  const { error } = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", itemId)
    .eq("uid", uid);
  throwSupabaseError(error, "删除衣物失败。");
  await removeImages(supabase, uid, [item.image_path]);
}

export async function swapWardrobeItemSortOrders(supabase, uid, body) {
  const sourceId = assertUuid(body.source_id, "来源衣物");
  const targetId = assertUuid(body.target_id, "目标衣物");
  assertCondition(sourceId !== targetId, 400, "DUPLICATE_IDS", "请选择两件不同的衣物。");
  const { error } = await supabase.rpc("swap_wardrobe_item_sort_orders", {
    p_uid: uid,
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

export async function reorderWardrobeItems(supabase, uid, body) {
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => assertUuid(id, "衣物")) : [];
  assertCondition(ids.length > 0 && ids.length <= 500, 400, "INVALID_IDS", "排序列表不能为空。" );
  assertCondition(new Set(ids).size === ids.length, 400, "DUPLICATE_IDS", "排序列表包含重复衣物。" );
  const { error } = await supabase.rpc("reorder_wardrobe_items", {
    p_uid: uid,
    p_item_ids: ids,
  });
  throwSupabaseError(error, "调整衣物顺序失败。");
  return { updated: ids.length };
}

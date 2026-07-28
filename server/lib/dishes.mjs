import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../config.mjs";
import { assertCondition, HttpError } from "./errors.mjs";
import { throwSupabaseError } from "./supabase.mjs";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicUrlFor(supabase, path) {
  if (!path) return "";
  return supabase.storage.from(config.dishBucket).getPublicUrl(path).data.publicUrl;
}

export function toDishResponse(supabase, dish) {
  return {
    id: dish.id,
    name: dish.name,
    category_id: dish.category_id,
    category: dish.categories || null,
    image_path: dish.image_path,
    thumbnail_path: dish.thumbnail_path,
    image_url: publicUrlFor(supabase, dish.image_path),
    thumbnail_url: publicUrlFor(supabase, dish.thumbnail_path || dish.image_path),
    printed_at: dish.printed_at,
    sort_order: dish.sort_order,
    created_at: dish.created_at,
    updated_at: dish.updated_at,
  };
}

export async function readMultipartImage(request) {
  const fields = {};
  let image;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "image") {
        part.file.resume();
        continue;
      }
      assertCondition(!image, 400, "MULTIPLE_IMAGES", "一次只能上传一张菜品图片。" );
      assertCondition(
        ALLOWED_IMAGE_TYPES.has(part.mimetype),
        415,
        "UNSUPPORTED_IMAGE_TYPE",
        "仅支持 PNG、JPEG 或 WebP 图片。",
      );
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      assertCondition(!part.file.truncated, 413, "IMAGE_TOO_LARGE", "图片文件过大。" );
      image = {
        buffer: Buffer.concat(chunks),
        mimetype: part.mimetype,
        filename: part.filename,
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "").trim();
    }
  }

  return { fields, image };
}

async function normalizeImage(buffer) {
  try {
    const source = sharp(buffer, { failOn: "error" }).rotate();
    const metadata = await source.metadata();
    assertCondition(
      metadata.width && metadata.height,
      400,
      "INVALID_IMAGE",
      "无法读取图片尺寸。",
    );

    const original = await source
      .clone()
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    const thumbnail = await source
      .clone()
      .resize({ width: 480, height: 360, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, alphaQuality: 90 })
      .toBuffer();

    return { original, thumbnail };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }
}

async function uploadImagePair(supabase, userId, dishId, buffer) {
  const revision = randomUUID();
  const basePath = `users/${userId}/dishes/${dishId}/${revision}`;
  const imagePath = `${basePath}-original.png`;
  const thumbnailPath = `${basePath}-thumbnail.webp`;
  const { original, thumbnail } = await normalizeImage(buffer);

  const { error: originalError } = await supabase.storage
    .from(config.dishBucket)
    .upload(imagePath, original, {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: false,
    });
  if (originalError) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", "上传菜品图片失败。" );
    wrapped.cause = originalError;
    throw wrapped;
  }

  const { error: thumbnailError } = await supabase.storage
    .from(config.dishBucket)
    .upload(thumbnailPath, thumbnail, {
      cacheControl: "31536000",
      contentType: "image/webp",
      upsert: false,
    });
  if (thumbnailError) {
    await supabase.storage.from(config.dishBucket).remove([imagePath]);
    const wrapped = new HttpError(500, "THUMBNAIL_UPLOAD_FAILED", "上传菜品缩略图失败。" );
    wrapped.cause = thumbnailError;
    throw wrapped;
  }

  return { imagePath, thumbnailPath };
}

async function removeImages(supabase, paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return;
  const { error } = await supabase.storage.from(config.dishBucket).remove(validPaths);
  if (error) console.error("删除 Storage 图片失败:", error);
}

async function assertCategoryExists(supabase, userId, categoryId) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取分类失败。" );
  assertCondition(data, 400, "CATEGORY_NOT_FOUND", "所选分类不存在。" );
  return data;
}

export async function listCategories(supabase, userId) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, sort_order, created_at")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  throwSupabaseError(error, "读取分类失败。" );
  return data;
}

export async function listDishes(supabase, userId, query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.page_size) || 30));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = supabase
    .from("dishes")
    .select("*, categories(id, name)", { count: "exact" })
    .eq("user_id", userId);

  if (query.category_id) request = request.eq("category_id", query.category_id);
  if (query.printed === "true") request = request.not("printed_at", "is", null);
  if (query.printed === "false") request = request.is("printed_at", null);

  switch (query.sort) {
    case "created_asc":
      request = request.order("created_at", { ascending: true });
      break;
    case "custom":
      request = request
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      break;
    case "created_desc":
    default:
      request = request.order("created_at", { ascending: false });
  }

  const { data, error, count } = await request.range(from, to);
  throwSupabaseError(error, "读取菜品列表失败。" );

  return {
    items: data.map((dish) => toDishResponse(supabase, dish)),
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
    },
  };
}

export async function getDish(supabase, userId, dishId) {
  const { data, error } = await supabase
    .from("dishes")
    .select("*, categories(id, name)")
    .eq("id", dishId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取菜品失败。" );
  assertCondition(data, 404, "DISH_NOT_FOUND", "菜品不存在。" );
  return data;
}

export async function createDish(supabase, userId, fields, image) {
  const name = fields.name?.trim();
  const categoryId = fields.category_id?.trim();
  assertCondition(name, 400, "DISH_NAME_REQUIRED", "请填写菜名。" );
  assertCondition(name.length <= 80, 400, "DISH_NAME_TOO_LONG", "菜名不能超过 80 个字符。" );
  assertCondition(categoryId, 400, "CATEGORY_REQUIRED", "请选择分类。" );
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择菜品图片。" );
  const category = await assertCategoryExists(supabase, userId, categoryId);

  const dishId = randomUUID();
  const paths = await uploadImagePair(supabase, userId, dishId, image.buffer);
  const { data, error } = await supabase
    .rpc("create_dish_at_end", {
      p_user_id: userId,
      p_id: dishId,
      p_name: name,
      p_category_id: categoryId,
      p_image_path: paths.imagePath,
      p_thumbnail_path: paths.thumbnailPath,
    })
    .single();

  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "创建菜品失败。" );
  }

  return toDishResponse(supabase, { ...data, categories: category });
}

export async function updateDish(supabase, userId, dishId, body) {
  await getDish(supabase, userId, dishId);
  const changes = {};

  if (body.name !== undefined) {
    assertCondition(typeof body.name === "string" && body.name.trim(), 400, "DISH_NAME_REQUIRED", "请填写菜名。" );
    assertCondition(body.name.trim().length <= 80, 400, "DISH_NAME_TOO_LONG", "菜名不能超过 80 个字符。" );
    changes.name = body.name.trim();
  }
  if (body.category_id !== undefined) {
    assertCondition(typeof body.category_id === "string" && body.category_id, 400, "CATEGORY_REQUIRED", "请选择分类。" );
    await assertCategoryExists(supabase, userId, body.category_id);
    changes.category_id = body.category_id;
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。" );

  const { data, error } = await supabase
    .from("dishes")
    .update(changes)
    .eq("id", dishId)
    .eq("user_id", userId)
    .select("*, categories(id, name)")
    .single();
  throwSupabaseError(error, "更新菜品失败。" );
  return toDishResponse(supabase, data);
}

export async function replaceDishImage(supabase, userId, dishId, image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择菜品图片。" );
  const dish = await getDish(supabase, userId, dishId);
  const paths = await uploadImagePair(supabase, userId, dishId, image.buffer);
  const { data, error } = await supabase
    .from("dishes")
    .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
    .eq("id", dishId)
    .eq("user_id", userId)
    .select("*, categories(id, name)")
    .single();

  if (error) {
    await removeImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "更新菜品图片失败。" );
  }

  await removeImages(supabase, [dish.image_path, dish.thumbnail_path]);
  return toDishResponse(supabase, data);
}

export async function deleteDish(supabase, userId, dishId) {
  const dish = await getDish(supabase, userId, dishId);
  const { error } = await supabase
    .from("dishes")
    .delete()
    .eq("id", dishId)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除菜品失败。" );
  await removeImages(supabase, [dish.image_path, dish.thumbnail_path]);
}

export async function updatePrintStatus(supabase, userId, body) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids)] : [];
  assertCondition(
    ids.length > 0 && ids.length <= 100 && ids.every((id) => typeof id === "string"),
    400,
    "INVALID_DISH_IDS",
    "请选择要更新的菜品。",
  );
  assertCondition(typeof body.printed === "boolean", 400, "INVALID_PRINT_STATUS", "打印状态无效。" );

  const { data: existing, error: existingError } = await supabase
    .from("dishes")
    .select("id")
    .eq("user_id", userId)
    .in("id", ids);
  throwSupabaseError(existingError, "检查菜品失败。" );
  assertCondition(existing.length === ids.length, 404, "DISH_NOT_FOUND", "部分菜品不存在。" );

  const { data, error } = await supabase
    .from("dishes")
    .update({ printed_at: body.printed ? new Date().toISOString() : null })
    .eq("user_id", userId)
    .in("id", ids)
    .select("id");
  throwSupabaseError(error, "更新打印状态失败。" );
  assertCondition(data.length === ids.length, 404, "DISH_NOT_FOUND", "部分菜品不存在。" );

  return { updated: data.length };
}

export async function reorderDishes(supabase, userId, body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  assertCondition(
    ids.length > 0 && ids.length <= 500 && ids.every((id) => typeof id === "string"),
    400,
    "INVALID_DISH_IDS",
    "排序列表不能为空。",
  );
  assertCondition(new Set(ids).size === ids.length, 400, "DUPLICATE_DISH_IDS", "排序列表包含重复菜品。" );

  const { error } = await supabase.rpc("reorder_dishes", {
    p_user_id: userId,
    p_dish_ids: ids,
  });
  throwSupabaseError(error, "保存自定义排序失败。", {
    "22023": {
      statusCode: 400,
      code: "INVALID_DISH_ORDER",
      message: "排序列表包含不存在或无效的菜品。",
    },
  });
  return { updated: ids.length };
}

export async function swapDishSortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId),
    400,
    "INVALID_DISH_IDS",
    "交换位置的菜品无效。",
  );
  assertCondition(
    sourceId !== targetId,
    400,
    "DUPLICATE_DISH_IDS",
    "请选择两个不同的菜品交换位置。",
  );

  const { error } = await supabase.rpc("swap_dish_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "交换菜品排序失败。", {
    P0002: {
      statusCode: 404,
      code: "DISH_NOT_FOUND",
      message: "交换位置的菜品不存在。",
    },
    "22023": {
      statusCode: 400,
      code: "INVALID_DISH_SWAP",
      message: "请选择两个不同的菜品交换位置。",
    },
  });
  return { updated: 2 };
}

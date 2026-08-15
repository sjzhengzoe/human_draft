import { randomUUID } from "node:crypto";
import { assertCondition } from "../../lib/errors.mjs";
import { toDishResponse } from "./dishes.mjs";
import {
  copyDishImageToScheduleArchive,
  createDishImageUrlMap,
  dishImageUrl,
  removeDishImages,
  uploadDishImage,
} from "./dish-images.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { UUID_PATTERN } from "../shared/records.mjs";

function toPreviewDish(dish, imageUrls) {
  const normalizedDish = toDishResponse(dish, imageUrls);
  return {
    id: normalizedDish.id,
    name: normalizedDish.name,
    introduction: normalizedDish.introduction,
    main_ingredients: normalizedDish.main_ingredients,
    cooking_methods: normalizedDish.cooking_methods,
    taste: normalizedDish.taste,
    image_url: normalizedDish.image_url,
  };
}

export function toMenuPlaceResponse(place, dishes = [], imageUrls = new Map()) {
  const menuDishes = dishes.map((dish) => toPreviewDish(dish, imageUrls));
  return {
    id: place.id,
    name: place.name,
    place_type: place.place_type,
    outside_category_id: place.outside_category_id || null,
    outside_category: place.outside_category || null,
    image_path: place.image_path || "",
    image_url: dishImageUrl(imageUrls, place.image_path),
    sort_order: place.sort_order ?? 0,
    dish_count: dishes.length,
    dishes: menuDishes,
    preview_dishes: menuDishes.slice(0, 5),
    created_at: place.created_at,
    updated_at: place.updated_at,
  };
}

async function assertOutsideCategoryExists(supabase, uid, categoryId) {
  assertCondition(UUID_PATTERN.test(categoryId), 400, "INVALID_OUTSIDE_CATEGORY", "外食分类无效。" );
  const { data, error } = await supabase
    .from("dining_scenes")
    .select("id, name")
    .eq("id", categoryId)
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取外食分类失败。" );
  assertCondition(data, 400, "OUTSIDE_CATEGORY_NOT_FOUND", "所选外食分类不存在。" );
  return data;
}

export async function listMenuPlaces(supabase, uid, query = {}) {
  const includeDishes = query.include_dishes !== "false" && query.include_dishes !== false;
  let request = supabase
    .from("menu_places")
    .select("*, outside_category:dining_scenes!menu_places_outside_category_user_fkey(id, name)")
    .eq("uid", uid);
  if (query.place_type) {
    assertCondition(
      query.place_type === "home" || query.place_type === "outside",
      400,
      "INVALID_PLACE_TYPE",
      "用餐地点类型无效。",
    );
    request = request.eq("place_type", query.place_type);
  }
  if (query.outside_category_id) {
    assertCondition(UUID_PATTERN.test(query.outside_category_id), 400, "INVALID_OUTSIDE_CATEGORY", "外食分类无效。" );
    request = request.eq("outside_category_id", query.outside_category_id);
  }
  const { data: places, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取用餐地点失败。" );
  if (!places?.length) return [];
  if (!includeDishes) {
    const imageUrls = await createDishImageUrlMap(
      places.map((place) => place.image_path),
    );
    return places.map((place) => toMenuPlaceResponse(place, [], imageUrls));
  }

  const placeIds = places.map((place) => place.id);
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("id, name, introduction, main_ingredients, cooking_methods, taste, place_id, image_path, place_sort_order, created_at")
    .eq("uid", uid)
    .in("place_id", placeIds)
    .order("place_sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(dishError, "读取地点菜品失败。" );
  const imageUrls = await createDishImageUrlMap(
    [
      ...places.map((place) => place.image_path),
      ...(dishes || []).map((dish) => dish.image_path),
    ],
  );

  const dishesByPlace = new Map();
  for (const dish of dishes || []) {
    const values = dishesByPlace.get(dish.place_id) || [];
    values.push(dish);
    dishesByPlace.set(dish.place_id, values);
  }
  return places.map((place) =>
    toMenuPlaceResponse(place, dishesByPlace.get(place.id) || [], imageUrls)
  );
}

async function requireMenuPlace(supabase, uid, placeId) {
  assertCondition(UUID_PATTERN.test(placeId), 400, "INVALID_PLACE_ID", "用餐地点无效。" );
  const { data, error } = await supabase
    .from("menu_places")
    .select("*, outside_category:dining_scenes!menu_places_outside_category_user_fkey(id, name)")
    .eq("id", placeId)
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取用餐地点失败。" );
  assertCondition(data, 404, "PLACE_NOT_FOUND", "用餐地点不存在。" );
  return data;
}

export async function getMenuPlace(supabase, uid, placeId) {
  const data = await requireMenuPlace(supabase, uid, placeId);
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("id, name, introduction, main_ingredients, cooking_methods, taste, place_id, image_path, place_sort_order, created_at")
    .eq("uid", uid)
    .eq("place_id", placeId)
    .order("place_sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(dishError, "读取地点菜品失败。" );
  const imageUrls = await createDishImageUrlMap(
    [
      data.image_path,
      ...(dishes || []).map((dish) => dish.image_path),
    ],
  );
  return toMenuPlaceResponse(data, dishes || [], imageUrls);
}

export async function reorderMenuPlaces(supabase, uid, body) {
  const ids = Array.isArray(body.ids) ? body.ids : [];
  assertCondition(
    ids.length > 0
      && ids.length <= 500
      && ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id)),
    400,
    "INVALID_PLACE_IDS",
    "排序列表不能为空。",
  );
  assertCondition(
    new Set(ids).size === ids.length,
    400,
    "DUPLICATE_PLACE_IDS",
    "排序列表包含重复店铺。",
  );

  const { error } = await supabase.rpc("reorder_menu_places", {
    p_uid: uid,
    p_place_ids: ids,
  });
  throwSupabaseError(error, "保存店铺排序失败。", {
    "22023": {
      statusCode: 400,
      code: "INVALID_PLACE_ORDER",
      message: "排序列表包含不存在或不同分类的店铺。",
    },
  });
  return { updated: ids.length };
}

export async function createMenuPlace(supabase, uid, fields, image) {
  const name = fields.name?.trim() || "";
  const outsideCategoryId = fields.outside_category_id?.trim() || "";
  assertCondition(name, 400, "PLACE_NAME_REQUIRED", "请填写店铺名。" );
  assertCondition(name.length <= 120, 400, "PLACE_NAME_TOO_LONG", "店铺名不能超过 120 个字符。" );
  await assertOutsideCategoryExists(supabase, uid, outsideCategoryId);
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择店铺图片。" );
  const placeId = randomUUID();
  const { imagePath } = await uploadDishImage(supabase, uid, placeId, image);
  const { error } = await supabase.rpc("create_menu_place_at_end", {
    p_uid: uid,
    p_id: placeId,
    p_name: name,
    p_outside_category_id: outsideCategoryId,
    p_image_path: imagePath,
  });
  if (error) {
    await removeDishImages(supabase, uid, [imagePath]);
    throwSupabaseError(error, "新增店铺失败。" );
  }
  return getMenuPlace(supabase, uid, placeId);
}

export async function updateMenuPlace(supabase, uid, placeId, body) {
  const place = await requireMenuPlace(supabase, uid, placeId);
  assertCondition(place.place_type === "outside", 400, "HOME_PLACE_READ_ONLY", "默认家庭地点不能编辑。" );
  const name = typeof body.name === "string" ? body.name.trim() : place.name;
  const outsideCategoryId = body.outside_category_id === undefined
    ? place.outside_category_id
    : body.outside_category_id;
  assertCondition(name && name.length <= 120, 400, "PLACE_NAME_REQUIRED", "请填写店铺名。" );
  await assertOutsideCategoryExists(supabase, uid, outsideCategoryId);

  const { error } = await supabase.rpc("update_menu_place", {
    p_uid: uid,
    p_place_id: placeId,
    p_name: name,
    p_outside_category_id: outsideCategoryId,
  });
  throwSupabaseError(error, "更新店铺失败。" );
  return getMenuPlace(supabase, uid, placeId);
}

export async function replaceMenuPlaceImage(supabase, uid, placeId, image) {
  const place = await requireMenuPlace(supabase, uid, placeId);
  assertCondition(place.place_type === "outside", 400, "PLACE_IMAGE_UNAVAILABLE", "当前地点不能更换图片。" );
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择店铺图片。" );
  const { imagePath } = await uploadDishImage(supabase, uid, placeId, image);
  const { error } = await supabase
    .from("menu_places")
    .update({ image_path: imagePath })
    .eq("id", placeId)
    .eq("uid", uid);
  if (error) {
    await removeDishImages(supabase, uid, [imagePath]);
    throwSupabaseError(error, "更新店铺图片失败。" );
  }
  await removeDishImages(supabase, uid, [place.image_path]);
  return getMenuPlace(supabase, uid, placeId);
}

export async function deleteMenuPlace(supabase, uid, placeId) {
  const place = await requireMenuPlace(supabase, uid, placeId);
  assertCondition(place.place_type === "outside", 400, "HOME_PLACE_READ_ONLY", "默认家庭地点不能删除。" );
  const { data: dishes, error } = await supabase
    .from("dishes")
    .select("id, image_path")
    .eq("uid", uid)
    .eq("place_id", placeId);
  throwSupabaseError(error, "读取店铺菜品失败。" );

  const sourceDishIds = (dishes || []).map((dish) => dish.id);
  const dishReferenceResult = sourceDishIds.length
    ? await supabase
      .from("menu_schedule_items")
      .select("dish_id")
      .eq("uid", uid)
      .eq("source_kind", "dish")
      .in("dish_id", sourceDishIds)
    : { data: [], error: null };
  throwSupabaseError(dishReferenceResult.error, "检查店铺菜品引用失败。" );
  const { data: placeReferences, error: placeReferenceError } = await supabase
    .from("menu_schedule_items")
    .select("id")
    .eq("uid", uid)
    .eq("source_kind", "place")
    .eq("place_id", placeId)
    .limit(1);
  throwSupabaseError(placeReferenceError, "检查店铺引用失败。" );

  const referencedDishIds = new Set(
    (dishReferenceResult.data || []).map((item) => item.dish_id),
  );
  const hasScheduleReferences = referencedDishIds.size > 0 || placeReferences?.length;
  const archivedPaths = [];
  try {
    const archivePlaceImagePath = hasScheduleReferences
      ? await copyDishImageToScheduleArchive(
        supabase,
        uid,
        place.id,
        place.image_path,
      )
      : "";
    if (archivePlaceImagePath) archivedPaths.push(archivePlaceImagePath);

    const dishArchives = [];
    for (const dish of dishes || []) {
      if (!referencedDishIds.has(dish.id)) continue;
      const archiveImagePath = await copyDishImageToScheduleArchive(
        supabase,
        uid,
        dish.id,
        dish.image_path,
      );
      if (archiveImagePath) archivedPaths.push(archiveImagePath);
      dishArchives.push({ dish_id: dish.id, archive_image_path: archiveImagePath });
    }

    const { error: deleteError } = await supabase.rpc("archive_and_delete_menu_place", {
      p_uid: uid,
      p_place_id: placeId,
      p_dish_archives: dishArchives,
      p_place_archive_image_path: archivePlaceImagePath,
    });
    throwSupabaseError(deleteError, "删除店铺失败。" );
  } catch (deleteError) {
    await removeDishImages(supabase, uid, archivedPaths);
    throw deleteError;
  }

  await removeDishImages(supabase, uid, [
    place.image_path,
    ...(dishes || []).map((dish) => dish.image_path),
  ]);
}

import { assertCondition } from "../../lib/errors.mjs";
import {
  createDish,
  replaceDishImage,
  toDishResponse,
  updateDish,
} from "./dishes.mjs";
import {
  copyDishImageToScheduleArchive,
  dishImagePublicUrl,
  removeDishImages,
} from "./dish-images.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { UUID_PATTERN } from "../shared/records.mjs";

function toPreviewDish(supabase, dish) {
  const normalizedDish = toDishResponse(supabase, dish);
  return {
    id: normalizedDish.id,
    name: normalizedDish.name,
    introduction: normalizedDish.introduction,
    main_ingredients: normalizedDish.main_ingredients,
    cooking_methods: normalizedDish.cooking_methods,
    taste: normalizedDish.taste,
    image_url: normalizedDish.image_url,
    thumbnail_url: normalizedDish.thumbnail_url,
  };
}

export function toMenuPlaceResponse(supabase, place, dishes = []) {
  const menuDishes = dishes.map((dish) => toPreviewDish(supabase, dish));
  return {
    id: place.id,
    name: place.name,
    place_type: place.place_type,
    outside_category_id: place.outside_category_id || null,
    outside_category: place.outside_category || null,
    image_path: place.image_path || "",
    thumbnail_path: place.thumbnail_path || null,
    image_url: dishImagePublicUrl(supabase, place.image_path),
    thumbnail_url: dishImagePublicUrl(supabase, place.thumbnail_path || place.image_path),
    sort_order: place.sort_order ?? 0,
    source_dish_id: place.source_dish_id || null,
    dish_count: dishes.length,
    dishes: menuDishes,
    preview_dishes: menuDishes.slice(0, 5),
    created_at: place.created_at,
    updated_at: place.updated_at,
  };
}

async function assertOutsideCategoryExists(supabase, userId, categoryId) {
  assertCondition(UUID_PATTERN.test(categoryId), 400, "INVALID_OUTSIDE_CATEGORY", "外食分类无效。" );
  const { data, error } = await supabase
    .from("dining_scenes")
    .select("id, name")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取外食分类失败。" );
  assertCondition(data, 400, "OUTSIDE_CATEGORY_NOT_FOUND", "所选外食分类不存在。" );
  return data;
}

export async function listMenuPlaces(supabase, userId, query = {}) {
  const includeDishes = query.include_dishes !== "false" && query.include_dishes !== false;
  let request = supabase
    .from("menu_places")
    .select("*, outside_category:dining_scenes!menu_places_outside_category_user_fkey(id, name)")
    .eq("user_id", userId);
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
    return places.map((place) => toMenuPlaceResponse(supabase, place));
  }

  const placeIds = places.map((place) => place.id);
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("id, name, introduction, main_ingredients, cooking_methods, taste, place_id, image_path, thumbnail_path, place_sort_order, created_at")
    .eq("user_id", userId)
    .in("place_id", placeIds)
    .order("place_sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(dishError, "读取地点菜品失败。" );

  const dishesByPlace = new Map();
  for (const dish of dishes || []) {
    const values = dishesByPlace.get(dish.place_id) || [];
    values.push(dish);
    dishesByPlace.set(dish.place_id, values);
  }
  return places.map((place) =>
    toMenuPlaceResponse(supabase, place, dishesByPlace.get(place.id) || [])
  );
}

export async function getMenuPlace(supabase, userId, placeId) {
  assertCondition(UUID_PATTERN.test(placeId), 400, "INVALID_PLACE_ID", "用餐地点无效。" );
  const { data, error } = await supabase
    .from("menu_places")
    .select("*, outside_category:dining_scenes!menu_places_outside_category_user_fkey(id, name)")
    .eq("id", placeId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取用餐地点失败。" );
  assertCondition(data, 404, "PLACE_NOT_FOUND", "用餐地点不存在。" );
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("id, name, introduction, main_ingredients, cooking_methods, taste, place_id, image_path, thumbnail_path, place_sort_order, created_at")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .order("place_sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(dishError, "读取地点菜品失败。" );
  return toMenuPlaceResponse(supabase, data, dishes || []);
}

export async function reorderMenuPlaces(supabase, userId, body) {
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
    p_user_id: userId,
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

export async function createMenuPlace(supabase, userId, fields, image) {
  const name = fields.name?.trim() || "";
  const outsideCategoryId = fields.outside_category_id?.trim() || "";
  assertCondition(name, 400, "PLACE_NAME_REQUIRED", "请填写店铺名。" );
  assertCondition(name.length <= 120, 400, "PLACE_NAME_TOO_LONG", "店铺名不能超过 120 个字符。" );
  await assertOutsideCategoryExists(supabase, userId, outsideCategoryId);
  const proxy = await createDish(supabase, userId, {
    name,
    record_type: "outside",
    outside_category_id: outsideCategoryId,
    meal_periods: JSON.stringify(["lunch", "dinner"]),
    recommended_items: "[]",
    main_ingredients: "[]",
    introduction: "",
    cooking_methods: "[]",
    taste: "[]",
    flavor_options: "[]",
  }, image);
  return getMenuPlace(supabase, userId, proxy.id);
}

export async function updateMenuPlace(supabase, userId, placeId, body) {
  const place = await getMenuPlace(supabase, userId, placeId);
  assertCondition(place.place_type === "outside", 400, "HOME_PLACE_READ_ONLY", "默认家庭地点不能编辑。" );
  const name = typeof body.name === "string" ? body.name.trim() : place.name;
  const outsideCategoryId = body.outside_category_id === undefined
    ? place.outside_category_id
    : body.outside_category_id;
  assertCondition(name && name.length <= 120, 400, "PLACE_NAME_REQUIRED", "请填写店铺名。" );
  await assertOutsideCategoryExists(supabase, userId, outsideCategoryId);

  if (place.source_dish_id) {
    await updateDish(supabase, userId, place.source_dish_id, {
      name,
      outside_category_id: outsideCategoryId,
    });
  } else {
    const { error } = await supabase
      .from("menu_places")
      .update({ name, outside_category_id: outsideCategoryId })
      .eq("id", placeId)
      .eq("user_id", userId);
    throwSupabaseError(error, "更新店铺失败。" );
  }
  return getMenuPlace(supabase, userId, placeId);
}

export async function replaceMenuPlaceImage(supabase, userId, placeId, image) {
  const place = await getMenuPlace(supabase, userId, placeId);
  assertCondition(place.place_type === "outside" && place.source_dish_id, 400, "PLACE_IMAGE_UNAVAILABLE", "当前地点不能更换图片。" );
  await replaceDishImage(supabase, userId, place.source_dish_id, image);
  return getMenuPlace(supabase, userId, placeId);
}

export async function deleteMenuPlace(supabase, userId, placeId) {
  const place = await getMenuPlace(supabase, userId, placeId);
  assertCondition(place.place_type === "outside", 400, "HOME_PLACE_READ_ONLY", "默认家庭地点不能删除。" );
  const { data: dishes, error } = await supabase
    .from("dishes")
    .select("id, image_path, thumbnail_path")
    .eq("user_id", userId)
    .eq("place_id", placeId);
  throwSupabaseError(error, "读取店铺菜品失败。" );

  const sourceDishIds = [
    ...(dishes || []).map((dish) => dish.id),
    place.source_dish_id,
  ].filter(Boolean);
  const dishReferenceResult = sourceDishIds.length
    ? await supabase
      .from("menu_schedule_items")
      .select("dish_id")
      .eq("user_id", userId)
      .eq("source_kind", "dish")
      .in("dish_id", sourceDishIds)
    : { data: [], error: null };
  throwSupabaseError(dishReferenceResult.error, "检查店铺菜品引用失败。" );
  const { data: placeReferences, error: placeReferenceError } = await supabase
    .from("menu_schedule_items")
    .select("id")
    .eq("user_id", userId)
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
        userId,
        place.id,
        place.thumbnail_path || place.image_path,
      )
      : "";
    if (archivePlaceImagePath) archivedPaths.push(archivePlaceImagePath);

    const dishArchives = [];
    for (const dish of dishes || []) {
      if (!referencedDishIds.has(dish.id)) continue;
      const archiveImagePath = await copyDishImageToScheduleArchive(
        supabase,
        userId,
        dish.id,
        dish.thumbnail_path || dish.image_path,
      );
      if (archiveImagePath) archivedPaths.push(archiveImagePath);
      dishArchives.push({ dish_id: dish.id, archive_image_path: archiveImagePath });
    }

    const { error: deleteError } = await supabase.rpc("archive_and_delete_menu_place", {
      p_user_id: userId,
      p_place_id: placeId,
      p_dish_archives: dishArchives,
      p_place_archive_image_path: archivePlaceImagePath,
    });
    throwSupabaseError(deleteError, "删除店铺失败。" );
  } catch (deleteError) {
    await removeDishImages(supabase, archivedPaths);
    throw deleteError;
  }

  await removeDishImages(supabase, [
    place.image_path,
    place.thumbnail_path,
    ...(dishes || []).flatMap((dish) => [dish.image_path, dish.thumbnail_path]),
  ]);
}

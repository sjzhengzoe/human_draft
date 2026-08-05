import { config } from "../config.mjs";
import { assertCondition } from "./errors.mjs";
import {
  createDish,
  deleteDish,
  replaceDishImage,
  updateDish,
} from "./dishes.mjs";
import { throwSupabaseError } from "./supabase.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publicUrlFor(supabase, path) {
  if (!path) return "";
  return supabase.storage.from(config.dishBucket).getPublicUrl(path).data.publicUrl;
}

function toPreviewDish(supabase, dish) {
  return {
    id: dish.id,
    name: dish.name,
    image_url: publicUrlFor(supabase, dish.image_path),
    thumbnail_url: publicUrlFor(supabase, dish.thumbnail_path || dish.image_path),
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
    image_url: publicUrlFor(supabase, place.image_path),
    thumbnail_url: publicUrlFor(supabase, place.thumbnail_path || place.image_path),
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

  const placeIds = places.map((place) => place.id);
  const { data: dishes, error: dishError } = await supabase
    .from("dishes")
    .select("id, name, place_id, image_path, thumbnail_path, place_sort_order, created_at")
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
    .select("id, name, place_id, image_path, thumbnail_path, place_sort_order, created_at")
    .eq("user_id", userId)
    .eq("place_id", placeId)
    .order("place_sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(dishError, "读取地点菜品失败。" );
  return toMenuPlaceResponse(supabase, data, dishes || []);
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
    taste: "",
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
    .select("id")
    .eq("user_id", userId)
    .eq("place_id", placeId);
  throwSupabaseError(error, "读取店铺菜品失败。" );
  for (const dish of dishes || []) await deleteDish(supabase, userId, dish.id);
  if (place.source_dish_id) await deleteDish(supabase, userId, place.source_dish_id);
  const { error: placeError } = await supabase
    .from("menu_places")
    .delete()
    .eq("id", placeId)
    .eq("user_id", userId);
  throwSupabaseError(placeError, "删除店铺失败。" );
}

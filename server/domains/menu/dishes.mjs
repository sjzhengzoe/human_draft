import { randomUUID } from "node:crypto";
import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { UUID_PATTERN } from "../shared/records.mjs";
import {
  ALLOWED_RECORD_TYPES,
  COOKING_METHOD_OPTIONS,
  DEFAULT_MEAL_PERIODS,
  TASTE_OPTIONS,
  enumLabels,
  isMissingMenuPlaceSchema,
  normalizeCookingMethods,
  normalizeFlavorOptions,
  normalizeIntroduction,
  normalizeMainIngredients,
  normalizeMealPeriods,
  normalizeRecommendedItems,
  normalizeRecordType,
  normalizeTaste,
} from "./dish-fields.mjs";
import {
  copyDishImageToScheduleArchive,
  createDishImageUrlMap,
  dishImageUrl,
  removeDishImages,
  uploadDishImage,
} from "./dish-images.mjs";

export function toDishResponse(dish, imageUrls = new Map()) {
  return {
    id: dish.id,
    name: dish.name,
    record_type: ALLOWED_RECORD_TYPES.has(dish.record_type) ? dish.record_type : "home",
    category_id: dish.category_id,
    category: dish.categories || null,
    outside_category_id: dish.outside_category_id || null,
    outside_category: dish.outside_category || null,
    recommended_items: Array.isArray(dish.recommended_items) ? dish.recommended_items : [],
    main_ingredients: Array.isArray(dish.main_ingredients) ? dish.main_ingredients : [],
    introduction: typeof dish.introduction === "string" ? dish.introduction : "",
    cooking_methods: enumLabels(dish.cooking_methods, COOKING_METHOD_OPTIONS),
    taste: enumLabels(dish.taste, TASTE_OPTIONS).join("、"),
    flavor_options: Array.isArray(dish.flavor_options) ? dish.flavor_options : [],
    place_id: dish.place_id || null,
    place_sort_order: dish.place_sort_order ?? dish.sort_order ?? 0,
    image_path: dish.image_path,
    thumbnail_path: dish.thumbnail_path,
    image_url: dishImageUrl(imageUrls, dish.image_path),
    thumbnail_url: dishImageUrl(imageUrls, dish.thumbnail_path || dish.image_path),
    meal_periods: Array.isArray(dish.meal_periods)
      ? dish.meal_periods
      : [...DEFAULT_MEAL_PERIODS],
    printed_at: dish.printed_at,
    sort_order: dish.sort_order,
    created_at: dish.created_at,
    updated_at: dish.updated_at,
  };
}

async function toSignedDishResponse(supabase, dish) {
  const imageUrls = await createDishImageUrlMap(
    supabase,
    [dish.image_path, dish.thumbnail_path],
  );
  return toDishResponse(dish, imageUrls);
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

async function assertOutsideCategoryExists(supabase, userId, categoryId) {
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

async function assertMenuPlaceExists(supabase, userId, placeId) {
  assertCondition(UUID_PATTERN.test(placeId), 400, "INVALID_PLACE_ID", "用餐地点无效。" );
  const { data, error } = await supabase
    .from("menu_places")
    .select("*")
    .eq("id", placeId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取用餐地点失败。" );
  assertCondition(data, 400, "PLACE_NOT_FOUND", "用餐地点不存在。" );
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
  const execute = async (useMenuPlaces) => {
    let request = supabase
      .from("dishes")
      .select(
        "*, categories(id, name), outside_category:dining_scenes!dishes_outside_category_user_fkey(id, name)",
        { count: "exact" },
      )
      .eq("user_id", userId);

    if (query.category_id) request = request.eq("category_id", query.category_id);
    if (query.outside_category_id) {
      request = request.eq("outside_category_id", query.outside_category_id);
    }
    if (query.record_type) {
      const recordType = normalizeRecordType(query.record_type);
      request = request.eq("record_type", recordType);
    }
    if (useMenuPlaces) {
      if (query.place_id) {
        assertCondition(UUID_PATTERN.test(query.place_id), 400, "INVALID_PLACE_ID", "用餐地点无效。" );
        request = request.eq("place_id", query.place_id);
      } else if (query.record_type === "outside") {
        // Older clients use this query to read store proxy rows.
        request = request.is("place_id", null);
      } else {
        request = request.not("place_id", "is", null);
      }
    }
    if (query.printed === "true") request = request.not("printed_at", "is", null);
    if (query.printed === "false") request = request.is("printed_at", null);

    switch (query.sort) {
      case "created_asc":
        request = request.order("created_at", { ascending: true });
        break;
      case "custom":
        request = query.place_id && useMenuPlaces
          ? request
            .order("place_sort_order", { ascending: true })
            .order("created_at", { ascending: false })
          : request
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false });
        break;
      case "created_desc":
      default:
        request = request.order("created_at", { ascending: false });
    }

    return request.range(from, to);
  };

  let result = await execute(true);
  if (result.error && isMissingMenuPlaceSchema(result.error) && !query.place_id) {
    result = await execute(false);
  }
  const { data, error, count } = result;
  throwSupabaseError(error, "读取菜品列表失败。" );
  const imageUrls = await createDishImageUrlMap(
    supabase,
    data.flatMap((dish) => [dish.image_path, dish.thumbnail_path]),
  );

  return {
    items: data.map((dish) => toDishResponse(dish, imageUrls)),
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
    .select("*, categories(id, name), outside_category:dining_scenes!dishes_outside_category_user_fkey(id, name)")
    .eq("id", dishId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取菜品失败。" );
  assertCondition(data, 404, "DISH_NOT_FOUND", "菜品不存在。" );
  return data;
}

export async function getDishResponse(supabase, userId, dishId) {
  return toSignedDishResponse(supabase, await getDish(supabase, userId, dishId));
}

export async function createDish(supabase, userId, fields, image) {
  const name = fields.name?.trim();
  const requestedPlaceId = fields.place_id?.trim() || "";
  const place = requestedPlaceId
    ? await assertMenuPlaceExists(supabase, userId, requestedPlaceId)
    : null;
  const recordType = place?.place_type || normalizeRecordType(fields.record_type, true);
  const categoryId = fields.category_id?.trim() || null;
  const outsideCategoryId = place?.outside_category_id || fields.outside_category_id?.trim() || null;
  assertCondition(name, 400, "DISH_NAME_REQUIRED", place ? "请填写菜名。" : recordType === "outside" ? "请填写店铺名。" : "请填写菜名。" );
  assertCondition(name.length <= 120, 400, "DISH_NAME_TOO_LONG", "名称不能超过 120 个字符。" );
  assertCondition(
    (place && place.place_type === "outside") || recordType === "outside" || categoryId,
    400,
    "CATEGORY_REQUIRED",
    "请选择分类。",
  );
  assertCondition(
    recordType === "home" || outsideCategoryId,
    400,
    "OUTSIDE_CATEGORY_REQUIRED",
    "请选择外食分类。",
  );
  assertCondition(
    image?.buffer?.length || place?.place_type === "outside",
    400,
    "IMAGE_REQUIRED",
    "请选择图片。",
  );
  const mealPeriods = normalizeMealPeriods(fields.meal_periods, true);
  const recommendedItems = recordType === "outside" && !place
    ? normalizeRecommendedItems(fields.recommended_items, true)
    : [];
  const mainIngredients = place || recordType === "home"
    ? normalizeMainIngredients(fields.main_ingredients, true)
    : [];
  const introduction = place || recordType === "home"
    ? normalizeIntroduction(fields.introduction, true)
    : "";
  const cookingMethods = place || recordType === "home"
    ? normalizeCookingMethods(fields.cooking_methods, true)
    : [];
  const taste = place || recordType === "home" ? normalizeTaste(fields.taste, true) : [];
  const flavorOptions = place || recordType === "home"
    ? normalizeFlavorOptions(fields.flavor_options, true)
    : [];
  const category = recordType === "home" && categoryId
    ? await assertCategoryExists(supabase, userId, categoryId)
    : null;
  const outsideCategory = recordType === "outside" && outsideCategoryId
    ? await assertOutsideCategoryExists(supabase, userId, outsideCategoryId)
    : null;

  const dishId = randomUUID();
  const paths = image?.buffer?.length
    ? await uploadDishImage(supabase, userId, dishId, image.buffer)
    : { imagePath: "", thumbnailPath: null };
  const rpcName = place ? "create_menu_dish" : "create_dish_at_end";
  const rpcPayload = place
    ? {
      p_user_id: userId,
      p_id: dishId,
      p_place_id: place.id,
      p_name: name,
      p_category_id: categoryId,
      p_image_path: paths.imagePath,
      p_thumbnail_path: paths.thumbnailPath,
      p_meal_periods: mealPeriods,
      p_main_ingredients: mainIngredients,
      p_introduction: introduction,
      p_cooking_methods: cookingMethods,
      p_taste: taste,
      p_flavor_options: flavorOptions,
    }
    : {
      p_user_id: userId,
      p_id: dishId,
      p_name: name,
      p_record_type: recordType,
      p_category_id: categoryId,
      p_outside_category_id: outsideCategoryId,
      p_image_path: paths.imagePath,
      p_thumbnail_path: paths.thumbnailPath,
      p_meal_periods: mealPeriods,
      p_recommended_items: recommendedItems,
      p_main_ingredients: mainIngredients,
      p_introduction: introduction,
      p_cooking_methods: cookingMethods,
      p_taste: taste,
      p_flavor_options: flavorOptions,
    };
  const { data, error } = await supabase
    .rpc(rpcName, rpcPayload)
    .single();

  if (error) {
    await removeDishImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "创建菜品失败。" );
  }

  return toSignedDishResponse(supabase, {
    ...data,
    categories: category,
    outside_category: outsideCategory,
  });
}

export async function updateDish(supabase, userId, dishId, body) {
  const existing = await getDish(supabase, userId, dishId);
  const changes = {};
  const existingRecordType = normalizeRecordType(existing.record_type, true);
  const targetPlaceId = body.place_id === undefined ? existing.place_id : body.place_id;
  const targetPlace = targetPlaceId
    ? await assertMenuPlaceExists(supabase, userId, targetPlaceId)
    : null;
  const recordType = targetPlace?.place_type || (body.record_type === undefined
    ? existingRecordType
    : normalizeRecordType(body.record_type));

  if (body.name !== undefined) {
    assertCondition(
      typeof body.name === "string" && body.name.trim(),
      400,
      "DISH_NAME_REQUIRED",
      recordType === "outside" ? "请填写店铺名。" : "请填写菜名。",
    );
    assertCondition(body.name.trim().length <= 120, 400, "DISH_NAME_TOO_LONG", "名称不能超过 120 个字符。" );
    changes.name = body.name.trim();
  }
  if (body.record_type !== undefined) {
    changes.record_type = recordType;
  }
  if (targetPlace) {
    const categoryId = body.category_id === undefined ? existing.category_id : body.category_id;
    assertCondition(
      targetPlace.place_type === "outside" || (typeof categoryId === "string" && categoryId),
      400,
      "CATEGORY_REQUIRED",
      "请选择分类。",
    );
    if (categoryId) await assertCategoryExists(supabase, userId, categoryId);
    changes.place_id = targetPlace.id;
    changes.record_type = targetPlace.place_type;
    changes.category_id = categoryId || null;
    changes.outside_category_id = targetPlace.place_type === "outside"
      ? targetPlace.outside_category_id
      : null;
    changes.recommended_items = [];
    if (body.main_ingredients !== undefined) {
      changes.main_ingredients = normalizeMainIngredients(body.main_ingredients);
    }
    if (body.introduction !== undefined) {
      changes.introduction = normalizeIntroduction(body.introduction);
    }
    if (body.cooking_methods !== undefined) {
      changes.cooking_methods = normalizeCookingMethods(body.cooking_methods);
    }
    if (body.taste !== undefined) {
      changes.taste = normalizeTaste(body.taste);
    }
    if (body.flavor_options !== undefined) {
      changes.flavor_options = normalizeFlavorOptions(body.flavor_options);
    }
    if (body.meal_periods !== undefined) {
      changes.meal_periods = normalizeMealPeriods(body.meal_periods);
    }
    assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。" );
    const { data, error } = await supabase
      .from("dishes")
      .update(changes)
      .eq("id", dishId)
      .eq("user_id", userId)
      .select("*, categories(id, name), outside_category:dining_scenes!dishes_outside_category_user_fkey(id, name)")
      .single();
    throwSupabaseError(error, "更新菜品失败。" );
    return toSignedDishResponse(supabase, data);
  }
  if (recordType === "home") {
    const categoryId = body.category_id === undefined ? existing.category_id : body.category_id;
    assertCondition(typeof categoryId === "string" && categoryId, 400, "CATEGORY_REQUIRED", "请选择分类。" );
    if (body.category_id !== undefined || existingRecordType === "outside") {
      await assertCategoryExists(supabase, userId, categoryId);
      changes.category_id = categoryId;
    }
    if (existingRecordType === "outside" || body.recommended_items !== undefined) {
      changes.recommended_items = [];
    }
    if (existing.outside_category_id !== null) changes.outside_category_id = null;
    if (body.main_ingredients !== undefined) {
      changes.main_ingredients = normalizeMainIngredients(body.main_ingredients);
    }
    if (body.introduction !== undefined) {
      changes.introduction = normalizeIntroduction(body.introduction);
    }
    if (body.cooking_methods !== undefined) {
      changes.cooking_methods = normalizeCookingMethods(body.cooking_methods);
    }
    if (body.taste !== undefined) {
      changes.taste = normalizeTaste(body.taste);
    }
    if (body.flavor_options !== undefined) {
      changes.flavor_options = normalizeFlavorOptions(body.flavor_options);
    }
  } else {
    const outsideCategoryId = body.outside_category_id === undefined
      ? existing.outside_category_id
      : body.outside_category_id;
    assertCondition(
      typeof outsideCategoryId === "string" && outsideCategoryId,
      400,
      "OUTSIDE_CATEGORY_REQUIRED",
      "请选择外食分类。",
    );
    if (body.outside_category_id !== undefined || existingRecordType === "home") {
      await assertOutsideCategoryExists(supabase, userId, outsideCategoryId);
      changes.outside_category_id = outsideCategoryId;
    }
    if (existing.category_id !== null) changes.category_id = null;
    if (body.recommended_items !== undefined) {
      changes.recommended_items = normalizeRecommendedItems(body.recommended_items);
    }
  }
  if (body.meal_periods !== undefined) {
    changes.meal_periods = normalizeMealPeriods(body.meal_periods);
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。" );

  const { data, error } = await supabase
    .from("dishes")
    .update(changes)
    .eq("id", dishId)
    .eq("user_id", userId)
    .select("*, categories(id, name), outside_category:dining_scenes!dishes_outside_category_user_fkey(id, name)")
    .single();
  throwSupabaseError(error, "更新菜品失败。" );
  return toSignedDishResponse(supabase, data);
}

export async function replaceDishImage(supabase, userId, dishId, image) {
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择菜品图片。" );
  const dish = await getDish(supabase, userId, dishId);
  const paths = await uploadDishImage(supabase, userId, dishId, image.buffer);
  const { data, error } = await supabase
    .from("dishes")
    .update({ image_path: paths.imagePath, thumbnail_path: paths.thumbnailPath })
    .eq("id", dishId)
    .eq("user_id", userId)
    .select("*, categories(id, name), outside_category:dining_scenes!dishes_outside_category_user_fkey(id, name)")
    .single();

  if (error) {
    await removeDishImages(supabase, [paths.imagePath, paths.thumbnailPath]);
    throwSupabaseError(error, "更新菜品图片失败。" );
  }

  await removeDishImages(supabase, [dish.image_path, dish.thumbnail_path]);
  return toSignedDishResponse(supabase, data);
}

export async function deleteDish(supabase, userId, dishId) {
  const dish = await getDish(supabase, userId, dishId);
  const { data: scheduleReferences, error: referenceError } = await supabase
    .from("menu_schedule_items")
    .select("id")
    .eq("user_id", userId)
    .eq("source_kind", "dish")
    .eq("dish_id", dishId)
    .limit(1);
  throwSupabaseError(referenceError, "检查菜单引用失败。" );

  let place = null;
  if (scheduleReferences?.length && dish.place_id) {
    const { data, error } = await supabase
      .from("menu_places")
      .select("id, image_path, thumbnail_path")
      .eq("id", dish.place_id)
      .eq("user_id", userId)
      .maybeSingle();
    throwSupabaseError(error, "读取菜品地点失败。" );
    place = data;
  }

  const archivedPaths = [];
  try {
    const archiveImagePath = scheduleReferences?.length
      ? await copyDishImageToScheduleArchive(
        supabase,
        userId,
        dish.id,
        dish.thumbnail_path || dish.image_path,
      )
      : "";
    if (archiveImagePath) archivedPaths.push(archiveImagePath);
    const archivePlaceImagePath = scheduleReferences?.length && place
      ? await copyDishImageToScheduleArchive(
        supabase,
        userId,
        place.id,
        place.thumbnail_path || place.image_path,
      )
      : "";
    if (archivePlaceImagePath) archivedPaths.push(archivePlaceImagePath);

    const { error } = await supabase.rpc("archive_and_delete_menu_dish", {
      p_user_id: userId,
      p_dish_id: dishId,
      p_archive_image_path: archiveImagePath,
      p_archive_place_image_path: archivePlaceImagePath,
    });
    throwSupabaseError(error, "删除菜品失败。" );
  } catch (error) {
    await removeDishImages(supabase, archivedPaths);
    throw error;
  }
  await removeDishImages(supabase, [dish.image_path, dish.thumbnail_path]);
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
  const placeId = typeof body.place_id === "string" ? body.place_id.trim() : "";
  assertCondition(
    ids.length > 0 && ids.length <= 500 && ids.every((id) => typeof id === "string"),
    400,
    "INVALID_DISH_IDS",
    "排序列表不能为空。",
  );
  assertCondition(new Set(ids).size === ids.length, 400, "DUPLICATE_DISH_IDS", "排序列表包含重复菜品。" );

  if (placeId) await assertMenuPlaceExists(supabase, userId, placeId);
  const { error } = await supabase.rpc(
    placeId ? "reorder_menu_dishes" : "reorder_dishes",
    placeId
      ? { p_user_id: userId, p_place_id: placeId, p_dish_ids: ids }
      : { p_user_id: userId, p_dish_ids: ids },
  );
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

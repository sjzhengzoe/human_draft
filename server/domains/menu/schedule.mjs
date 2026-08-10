import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { dishImagePublicUrl } from "./dish-images.mjs";
import { UUID_PATTERN } from "../shared/records.mjs";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_PERIODS = new Set(["breakfast", "lunch", "afternoon_tea", "dinner"]);
const SOURCE_KINDS = new Set(["dish", "place"]);

function isDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function dayDistance(start, end) {
  return Math.round(
    (new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime())
      / 86400000,
  );
}

function todayInShanghai() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalizeRange(query, maxDays = 370) {
  const start = query.start;
  const end = query.end;
  assertCondition(isDate(start) && isDate(end), 400, "INVALID_DATE_RANGE", "日期范围无效。" );
  const distance = dayDistance(start, end);
  assertCondition(distance >= 0 && distance <= maxDays, 400, "INVALID_DATE_RANGE", "日期范围不能超过一年。" );
  return { start, end };
}

function toScheduleItem(supabase, item) {
  return {
    id: item.id,
    source_kind: item.source_kind,
    record_type: item.record_type,
    dish_id: item.dish_id || null,
    place_id: item.place_id || null,
    name: item.snapshot_name,
    place_name: item.snapshot_place_name || "",
    image_url: dishImagePublicUrl(supabase, item.snapshot_image_path),
    place_image_url: dishImagePublicUrl(supabase, item.snapshot_place_image_path),
    position: Number(item.position || 0),
  };
}

export async function listMenuSchedule(supabase, userId, query = {}) {
  const { start, end } = normalizeRange(query);
  const { data: meals, error } = await supabase
    .from("menu_schedule_meals")
    .select("id, meal_date, meal_period, slot_count, created_at, updated_at")
    .eq("user_id", userId)
    .gte("meal_date", start)
    .lte("meal_date", end)
    .order("meal_date", { ascending: true })
    .order("meal_period", { ascending: true });
  throwSupabaseError(error, "读取本周菜单失败。" );
  if (!meals?.length) return { start, end, meals: [] };

  const mealIds = meals.map((meal) => meal.id);
  const { data: items, error: itemError } = await supabase
    .from("menu_schedule_items")
    .select("id, meal_id, source_kind, record_type, dish_id, place_id, snapshot_name, snapshot_place_name, snapshot_image_path, snapshot_place_image_path, position")
    .eq("user_id", userId)
    .in("meal_id", mealIds)
    .order("position", { ascending: true });
  throwSupabaseError(itemError, "读取菜单内容失败。" );

  const itemsByMeal = new Map();
  for (const item of items || []) {
    const values = itemsByMeal.get(item.meal_id) || [];
    values.push(toScheduleItem(supabase, item));
    itemsByMeal.set(item.meal_id, values);
  }
  return {
    start,
    end,
    meals: meals.map((meal) => ({
      id: meal.id,
      meal_date: meal.meal_date,
      meal_period: meal.meal_period,
      slot_count: Number(meal.slot_count || 3),
      items: itemsByMeal.get(meal.id) || [],
      created_at: meal.created_at,
      updated_at: meal.updated_at,
    })),
  };
}

function normalizeScheduleItems(items, slotCount) {
  assertCondition(Array.isArray(items) && items.length <= slotCount, 400, "INVALID_MEAL_ITEMS", "所选菜品数量超过当前档位。" );
  const seen = new Set();
  return items.map((item) => {
    const sourceKind = item?.source_kind;
    assertCondition(SOURCE_KINDS.has(sourceKind), 400, "INVALID_SOURCE_KIND", "菜单选项类型无效。" );
    const id = sourceKind === "dish" ? item.dish_id : item.place_id;
    assertCondition(typeof id === "string" && UUID_PATTERN.test(id), 400, "INVALID_SOURCE_ID", "菜单选项无效。" );
    const key = `${sourceKind}:${id}`;
    assertCondition(!seen.has(key), 400, "DUPLICATE_MENU_ITEM", "同一个菜品或店铺不能重复选择。" );
    seen.add(key);
    return sourceKind === "dish"
      ? { source_kind: "dish", dish_id: id }
      : { source_kind: "place", place_id: id };
  });
}

export async function replaceMenuScheduleMeal(supabase, userId, body = {}) {
  assertCondition(isDate(body.meal_date), 400, "INVALID_MEAL_DATE", "用餐日期无效。" );
  assertCondition(MEAL_PERIODS.has(body.meal_period), 400, "INVALID_MEAL_PERIOD", "餐次无效。" );
  const slotCount = Number(body.slot_count);
  assertCondition(Number.isInteger(slotCount) && slotCount >= 1 && slotCount <= 12, 400, "INVALID_SLOT_COUNT", "菜品档位应在 1 到 12 个之间。" );
  const items = normalizeScheduleItems(body.items, slotCount);
  const { error } = await supabase.rpc("replace_menu_schedule_meal", {
    p_user_id: userId,
    p_meal_date: body.meal_date,
    p_meal_period: body.meal_period,
    p_slot_count: slotCount,
    p_items: items,
  });
  throwSupabaseError(error, "保存本周菜单失败。", {
    P0002: { statusCode: 404, code: "MENU_SOURCE_NOT_FOUND", message: "所选菜品或店铺已不存在。" },
    "22023": { statusCode: 400, code: "INVALID_MENU_SCHEDULE", message: "菜单记录无效。" },
  });
  const result = await listMenuSchedule(supabase, userId, {
    start: body.meal_date,
    end: body.meal_date,
  });
  return result.meals.find((meal) => meal.meal_period === body.meal_period) || null;
}

export async function getMenuRanking(supabase, userId, query = {}) {
  const range = normalizeRange(query);
  const today = todayInShanghai();
  const effectiveEnd = range.end < today ? range.end : today;
  if (effectiveEnd < range.start) {
    return { ...range, effective_end: effectiveEnd, items: [] };
  }
  const schedule = await listMenuSchedule(supabase, userId, {
    start: range.start,
    end: effectiveEnd,
  });
  const counts = new Map();

  for (const meal of schedule.meals) {
    const seenInMeal = new Set();
    for (const item of meal.items) {
      const isStore = item.record_type === "outside" || item.source_kind === "place";
      const stableId = isStore ? item.place_id : item.dish_id;
      const name = isStore ? item.place_name || item.name : item.name;
      const fallbackKey = `${isStore ? "place" : "dish"}:${name}`;
      const key = `${isStore ? "place" : "dish"}:${stableId || fallbackKey}`;
      if (seenInMeal.has(key)) continue;
      seenInMeal.add(key);
      const current = counts.get(key);
      if (current) {
        current.count += 1;
      } else {
        counts.set(key, {
          key,
          type: isStore ? "place" : "dish",
          name,
          image_url: isStore ? item.place_image_url || item.image_url : item.image_url,
          count: 1,
        });
      }
    }
  }

  const items = [...counts.values()].sort((left, right) =>
    right.count - left.count || left.name.localeCompare(right.name, "zh-CN")
  );
  return { ...range, effective_end: effectiveEnd, items };
}

export async function listMenuFavorites(supabase, userId) {
  const { data: favorites, error } = await supabase
    .from("menu_favorites")
    .select("id, source_kind, dish_id, place_id, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取常吃清单失败。" );
  if (!favorites?.length) return [];

  const dishIds = favorites.filter((item) => item.source_kind === "dish").map((item) => item.dish_id);
  const placeIds = favorites.filter((item) => item.source_kind === "place").map((item) => item.place_id);
  const [{ data: dishes, error: dishError }, { data: places, error: placeError }] = await Promise.all([
    dishIds.length
      ? supabase.from("dishes").select("id, name, record_type, place_id, image_path, thumbnail_path").eq("user_id", userId).in("id", dishIds)
      : Promise.resolve({ data: [], error: null }),
    placeIds.length
      ? supabase.from("menu_places").select("id, name, place_type, image_path, thumbnail_path").eq("user_id", userId).in("id", placeIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  throwSupabaseError(dishError, "读取常吃菜品失败。" );
  throwSupabaseError(placeError, "读取常吃店铺失败。" );
  const dishMap = new Map((dishes || []).map((dish) => [dish.id, dish]));
  const placeMap = new Map((places || []).map((place) => [place.id, place]));

  return favorites.flatMap((favorite) => {
    const source = favorite.source_kind === "dish"
      ? dishMap.get(favorite.dish_id)
      : placeMap.get(favorite.place_id);
    if (!source) return [];
    return [{
      id: favorite.id,
      source_kind: favorite.source_kind,
      dish_id: favorite.dish_id || null,
      place_id: favorite.place_id || null,
      name: source.name,
      record_type: source.record_type || source.place_type,
      image_url: dishImagePublicUrl(supabase, source.thumbnail_path || source.image_path),
      sort_order: Number(favorite.sort_order || 0),
    }];
  });
}

export async function replaceMenuFavorites(supabase, userId, body = {}) {
  const items = Array.isArray(body.items) ? body.items : null;
  assertCondition(items && items.length <= 100, 400, "INVALID_FAVORITES", "常吃清单无效。" );
  const normalized = normalizeScheduleItems(items, Math.max(1, items.length));
  const { error } = await supabase.rpc("replace_menu_favorites", {
    p_user_id: userId,
    p_items: normalized,
  });
  throwSupabaseError(error, "保存常吃清单失败。", {
    P0002: { statusCode: 404, code: "MENU_SOURCE_NOT_FOUND", message: "部分菜品或店铺已不存在。" },
    "22023": { statusCode: 400, code: "INVALID_FAVORITES", message: "常吃清单无效。" },
  });
  return listMenuFavorites(supabase, userId);
}

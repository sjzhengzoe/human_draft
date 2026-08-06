import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  nextSortOrder,
  requiredText,
  requireRecord,
  textArray,
  UUID_PATTERN,
} from "../shared/records.mjs";

export const DINING_MODES = ["takeout", "dine_in"];

export async function listDiningPlaces(supabase, userId, query) {
  let request = supabase
    .from("dining_places")
    .select("*")
    .eq("user_id", userId);
  if (typeof query.scene_id === "string" && query.scene_id.trim()) {
    assertCondition(
      UUID_PATTERN.test(query.scene_id),
      400,
      "INVALID_ID",
      "用餐场景编号无效。",
    );
    request = request.eq("scene_id", query.scene_id);
  }
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("name", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取吃什么清单失败。");
  return data;
}

export async function getDiningPlace(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "店铺编号无效。");
  return requireRecord(supabase, userId, "dining_places", id);
}

function diningPayload(body) {
  const modes = textArray(body.service_modes || [], "用餐方式", 2);
  assertCondition(
    modes.length > 0 && modes.every((mode) => DINING_MODES.includes(mode)),
    400,
    "INVALID_DINING_MODES",
    "请至少选择一种用餐方式。",
  );
  return {
    name: requiredText(body.name, "店铺名"),
    scene_id: requiredText(body.scene_id, "用餐场景"),
    service_modes: modes,
    menu_items: textArray(body.menu_items || [], "菜品", 100),
  };
}

export async function listDiningScenes(supabase, userId) {
  const { data, error } = await supabase
    .from("dining_scenes")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取用餐场景失败。");
  return data;
}

export async function getDiningScene(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "用餐场景编号无效。");
  return requireRecord(supabase, userId, "dining_scenes", id);
}

export async function createDiningScene(supabase, userId, body) {
  const { data, error } = await supabase
    .rpc("create_dining_scene_at_end", {
      p_user_id: userId,
      p_name: requiredText(body.name, "场景名称", 40),
    })
    .single();
  throwSupabaseError(error, "新增用餐场景失败。", {
    23505: {
      statusCode: 409,
      code: "DINING_SCENE_EXISTS",
      message: "场景名称已存在。",
    },
  });
  return data;
}

export async function updateDiningScene(supabase, userId, id, body) {
  await getDiningScene(supabase, userId, id);
  const { data, error } = await supabase
    .from("dining_scenes")
    .update({ name: requiredText(body.name, "场景名称", 40) })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新用餐场景失败。", {
    23505: {
      statusCode: 409,
      code: "DINING_SCENE_EXISTS",
      message: "场景名称已存在。",
    },
  });
  return data;
}

export async function deleteDiningScene(supabase, userId, id) {
  await getDiningScene(supabase, userId, id);
  const { data: place, error: placeError } = await supabase
    .from("dining_places")
    .select("id")
    .eq("user_id", userId)
    .eq("scene_id", id)
    .limit(1)
    .maybeSingle();
  throwSupabaseError(placeError, "检查用餐场景失败。");
  assertCondition(
    !place,
    409,
    "DINING_SCENE_NOT_EMPTY",
    "场景下还有店铺，暂时不能删除。",
  );
  const { error } = await supabase
    .from("dining_scenes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除用餐场景失败。");
}

export async function swapDiningSceneSortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId) && sourceId !== targetId,
    400,
    "INVALID_IDS",
    "请选择两个不同的用餐场景。",
  );
  const { error } = await supabase.rpc("swap_dining_scene_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整用餐场景排序失败。");
  return { updated: 2 };
}

export async function createDiningPlace(supabase, userId, body) {
  const payload = diningPayload(body);
  await requireRecord(supabase, userId, "dining_scenes", payload.scene_id, "id");
  const { data, error } = await supabase
    .from("dining_places")
    .insert({
      ...payload,
      user_id: userId,
      sort_order: await nextSortOrder(supabase, userId, "dining_places"),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增店铺失败。");
  return data;
}

export async function updateDiningPlace(supabase, userId, id, body) {
  await requireRecord(supabase, userId, "dining_places", id, "id");
  const payload = diningPayload(body);
  await requireRecord(supabase, userId, "dining_scenes", payload.scene_id, "id");
  const { data, error } = await supabase
    .from("dining_places")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新店铺失败。");
  return data;
}

export async function deleteDiningPlace(supabase, userId, id) {
  await requireRecord(supabase, userId, "dining_places", id, "id");
  const { error } = await supabase
    .from("dining_places")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除店铺失败。");
}

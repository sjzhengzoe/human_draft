import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  requiredText,
  requireRecord,
  UUID_PATTERN,
} from "../shared/records.mjs";

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
    .from("menu_places")
    .select("id")
    .eq("user_id", userId)
    .eq("outside_category_id", id)
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

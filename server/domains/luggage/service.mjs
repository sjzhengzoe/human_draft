import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { nextSortOrder, requiredText, requireRecord } from "../shared/records.mjs";

export async function listLuggageScenes(supabase, userId) {
  const [sceneResult, groupResult, itemResult] = await Promise.all([
    supabase
      .from("luggage_scenes")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("luggage_groups")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("luggage_items")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);
  throwSupabaseError(sceneResult.error, "读取行李场景失败。");
  throwSupabaseError(groupResult.error, "读取行李层级失败。");
  throwSupabaseError(itemResult.error, "读取行李物品失败。");

  return sceneResult.data.map((scene) => ({
    ...scene,
    groups: groupResult.data
      .filter((group) => group.scene_id === scene.id)
      .map((group) => ({
        ...group,
        items: itemResult.data.filter((item) => item.group_id === group.id),
      })),
  }));
}

export async function createLuggageScene(supabase, userId, body) {
  const name = requiredText(body.name, "场景名称", 80);
  const { data: scene, error } = await supabase
    .from("luggage_scenes")
    .insert({
      user_id: userId,
      name,
      sort_order: await nextSortOrder(supabase, userId, "luggage_scenes"),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李场景失败。");

  const { data: group, error: groupError } = await supabase
    .from("luggage_groups")
    .insert({
      user_id: userId,
      scene_id: scene.id,
      name: "必备物品",
      is_required: true,
      sort_order: 1000,
    })
    .select("*")
    .single();
  if (groupError) {
    await supabase
      .from("luggage_scenes")
      .delete()
      .eq("id", scene.id)
      .eq("user_id", userId);
    throwSupabaseError(groupError, "创建必备物品层级失败。");
  }
  return { ...scene, groups: [{ ...group, items: [] }] };
}

export async function updateLuggageScene(supabase, userId, id, body) {
  await requireRecord(supabase, userId, "luggage_scenes", id, "id");
  const { data, error } = await supabase
    .from("luggage_scenes")
    .update({ name: requiredText(body.name, "场景名称", 80) })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李场景失败。");
  return data;
}

export async function deleteLuggageScene(supabase, userId, id) {
  await requireRecord(supabase, userId, "luggage_scenes", id, "id");
  const { error } = await supabase
    .from("luggage_scenes")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除行李场景失败。");
}

export async function createLuggageGroup(supabase, userId, body) {
  const sceneId = requiredText(body.scene_id, "场景");
  await requireRecord(supabase, userId, "luggage_scenes", sceneId, "id");
  const { data, error } = await supabase
    .from("luggage_groups")
    .insert({
      user_id: userId,
      scene_id: sceneId,
      name: requiredText(body.name, "层级名称", 80),
      is_required: false,
      sort_order: await nextSortOrder(supabase, userId, "luggage_groups", {
        scene_id: sceneId,
      }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李层级失败。");
  return { ...data, items: [] };
}

export async function updateLuggageGroup(supabase, userId, id, body) {
  await requireRecord(supabase, userId, "luggage_groups", id, "id");
  const { data, error } = await supabase
    .from("luggage_groups")
    .update({ name: requiredText(body.name, "层级名称", 80) })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李层级失败。");
  return data;
}

export async function deleteLuggageGroup(supabase, userId, id) {
  await requireRecord(supabase, userId, "luggage_groups", id, "id");
  const { error } = await supabase
    .from("luggage_groups")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除行李层级失败。");
}

export async function swapLuggageGroupSortOrders(supabase, userId, body) {
  const sourceId = requiredText(body.source_id, "源行李层级");
  const targetId = requiredText(body.target_id, "目标行李层级");
  assertCondition(
    sourceId !== targetId,
    400,
    "SAME_RECORD",
    "请选择不同的行李层级。",
  );
  const { error } = await supabase.rpc("swap_luggage_group_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整行李层级顺序失败。");
}

export async function moveLuggageGroup(supabase, userId, body) {
  const sourceId = requiredText(body.source_id, "源行李层级");
  const targetId = requiredText(body.target_id, "目标行李层级");
  assertCondition(
    typeof body.insert_after === "boolean",
    400,
    "INVALID_POSITION",
    "层级插入位置无效。",
  );
  const { error } = await supabase.rpc("move_luggage_group", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
    p_insert_after: body.insert_after,
  });
  throwSupabaseError(error, "调整行李层级顺序失败。");
}

export async function createLuggageItem(supabase, userId, body) {
  const groupId = requiredText(body.group_id, "行李层级");
  await requireRecord(supabase, userId, "luggage_groups", groupId, "id");
  const { data, error } = await supabase
    .from("luggage_items")
    .insert({
      user_id: userId,
      group_id: groupId,
      name: requiredText(body.name, "物品名称"),
      sort_order: await nextSortOrder(supabase, userId, "luggage_items", {
        group_id: groupId,
      }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李物品失败。");
  return data;
}

export async function updateLuggageItem(supabase, userId, id, body) {
  await requireRecord(supabase, userId, "luggage_items", id, "id");
  const { data, error } = await supabase
    .from("luggage_items")
    .update({ name: requiredText(body.name, "物品名称") })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李物品失败。");
  return data;
}

export async function moveLuggageItem(supabase, userId, id, body) {
  const targetGroupId = requiredText(body.target_group_id, "目标行李层级");
  const targetItemId =
    body.target_item_id == null || body.target_item_id === ""
      ? null
      : requiredText(body.target_item_id, "目标物品");
  assertCondition(
    typeof body.insert_after === "boolean",
    400,
    "INVALID_POSITION",
    "物品插入位置无效。",
  );
  const { error } = await supabase.rpc("move_luggage_item", {
    p_user_id: userId,
    p_source_id: id,
    p_target_group_id: targetGroupId,
    p_target_item_id: targetItemId,
    p_insert_after: body.insert_after,
  });
  throwSupabaseError(error, "移动行李物品失败。");
}

export async function deleteLuggageItem(supabase, userId, id) {
  await requireRecord(supabase, userId, "luggage_items", id, "id");
  const { error } = await supabase
    .from("luggage_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除行李物品失败。");
}

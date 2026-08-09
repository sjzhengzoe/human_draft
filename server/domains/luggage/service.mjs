import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  nextSortOrder,
  requiredText,
  requireRecord,
  UUID_PATTERN,
} from "../shared/records.mjs";

export async function listLuggageScenes(supabase, userId) {
  const [sceneResult, groupResult, itemResult] = await Promise.all([
    supabase
      .from("luggage_scenes")
      .select("id,name,sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("luggage_groups")
      .select("id,scene_id,name,is_required,sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("luggage_items")
      .select("id,group_id,name,sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);
  throwSupabaseError(sceneResult.error, "读取行李场景失败。");
  throwSupabaseError(groupResult.error, "读取行李层级失败。");
  throwSupabaseError(itemResult.error, "读取行李物品失败。");

  const itemsByGroupId = new Map();
  for (const item of itemResult.data) {
    const items = itemsByGroupId.get(item.group_id) || [];
    items.push(item);
    itemsByGroupId.set(item.group_id, items);
  }

  const groupsBySceneId = new Map();
  for (const group of groupResult.data) {
    const groups = groupsBySceneId.get(group.scene_id) || [];
    groups.push({ ...group, items: itemsByGroupId.get(group.id) || [] });
    groupsBySceneId.set(group.scene_id, groups);
  }

  return sceneResult.data.map((scene) => ({
    ...scene,
    groups: groupsBySceneId.get(scene.id) || [],
  }));
}

function hasSameIds(left, right) {
  if (left.length !== right.length) return false;
  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
}

export async function reorderLuggageScenes(supabase, userId, body) {
  const sceneIds = Array.isArray(body.scene_ids) ? body.scene_ids : [];
  assertCondition(
    sceneIds.length > 0
      && sceneIds.length <= 100
      && sceneIds.every((id) => typeof id === "string" && UUID_PATTERN.test(id)),
    400,
    "INVALID_LUGGAGE_SCENE_ORDER",
    "行李场景排序列表无效。",
  );
  assertCondition(
    new Set(sceneIds).size === sceneIds.length,
    400,
    "DUPLICATE_LUGGAGE_SCENES",
    "行李场景排序列表包含重复内容。",
  );

  const { data: scenes, error } = await supabase
    .from("luggage_scenes")
    .select("id,sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取行李场景排序失败。");
  assertCondition(
    hasSameIds(sceneIds, scenes.map((scene) => scene.id)),
    400,
    "INVALID_LUGGAGE_SCENE_ORDER",
    "行李场景排序数据已经变化，请重新加载。",
  );

  const scenesById = new Map(scenes.map((scene) => [scene.id, scene]));
  let updated = 0;
  for (let index = 0; index < sceneIds.length; index += 1) {
    const id = sceneIds[index];
    const sortOrder = (index + 1) * 1000;
    if (scenesById.get(id)?.sort_order === sortOrder) continue;
    const { error: updateError } = await supabase
      .from("luggage_scenes")
      .update({ sort_order: sortOrder })
      .eq("id", id)
      .eq("user_id", userId);
    throwSupabaseError(updateError, "保存行李场景排序失败。");
    updated += 1;
  }

  return { updated };
}

export async function reorderLuggageScene(supabase, userId, body) {
  const sceneId = requiredText(body.scene_id, "行李场景");
  const groupIds = Array.isArray(body.group_ids) ? body.group_ids : [];
  const itemIdsByGroup = body.item_ids_by_group;
  assertCondition(UUID_PATTERN.test(sceneId), 400, "INVALID_LUGGAGE_SCENE", "行李场景无效。");
  assertCondition(
    groupIds.length > 0
      && groupIds.length <= 100
      && groupIds.every((id) => typeof id === "string" && UUID_PATTERN.test(id)),
    400,
    "INVALID_LUGGAGE_GROUP_ORDER",
    "行李层级排序列表无效。",
  );
  assertCondition(
    new Set(groupIds).size === groupIds.length,
    400,
    "DUPLICATE_LUGGAGE_GROUPS",
    "行李层级排序列表包含重复内容。",
  );
  assertCondition(
    itemIdsByGroup
      && typeof itemIdsByGroup === "object"
      && !Array.isArray(itemIdsByGroup),
    400,
    "INVALID_LUGGAGE_ITEM_ORDER",
    "行李物品排序列表无效。",
  );

  const scenes = await listLuggageScenes(supabase, userId);
  const scene = scenes.find((item) => item.id === sceneId);
  assertCondition(scene, 404, "LUGGAGE_SCENE_NOT_FOUND", "行李场景不存在。");
  const currentGroupIds = scene.groups.map((group) => group.id);
  assertCondition(
    hasSameIds(groupIds, currentGroupIds),
    400,
    "INVALID_LUGGAGE_GROUP_ORDER",
    "行李层级排序数据已经变化，请重新加载。",
  );
  assertCondition(
    hasSameIds(Object.keys(itemIdsByGroup), currentGroupIds),
    400,
    "INVALID_LUGGAGE_ITEM_GROUPS",
    "行李物品层级数据已经变化，请重新加载。",
  );

  let totalItems = 0;
  for (const group of scene.groups) {
    const desiredItemIds = itemIdsByGroup[group.id];
    const currentItemIds = group.items.map((item) => item.id);
    assertCondition(
      Array.isArray(desiredItemIds)
        && desiredItemIds.length <= 500
        && desiredItemIds.every((id) => typeof id === "string" && UUID_PATTERN.test(id))
        && new Set(desiredItemIds).size === desiredItemIds.length
        && hasSameIds(desiredItemIds, currentItemIds),
      400,
      "INVALID_LUGGAGE_ITEM_ORDER",
      "行李物品排序数据已经变化，请重新加载。",
    );
    totalItems += desiredItemIds.length;
  }
  assertCondition(totalItems <= 2000, 400, "TOO_MANY_LUGGAGE_ITEMS", "行李物品数量过多。");

  const workingGroupIds = [...currentGroupIds];
  let updated = 0;
  for (let index = 0; index < groupIds.length; index += 1) {
    const desiredGroupId = groupIds[index];
    if (workingGroupIds[index] === desiredGroupId) continue;
    const currentIndex = workingGroupIds.indexOf(desiredGroupId);
    const targetGroupId = workingGroupIds[index];
    await moveLuggageGroup(supabase, userId, {
      source_id: desiredGroupId,
      target_id: targetGroupId,
      insert_after: false,
    });
    workingGroupIds.splice(currentIndex, 1);
    workingGroupIds.splice(index, 0, desiredGroupId);
    updated += 1;
  }

  for (const group of scene.groups) {
    const desiredItemIds = itemIdsByGroup[group.id];
    const workingItemIds = group.items.map((item) => item.id);
    for (let index = 0; index < desiredItemIds.length; index += 1) {
      const desiredItemId = desiredItemIds[index];
      if (workingItemIds[index] === desiredItemId) continue;
      const currentIndex = workingItemIds.indexOf(desiredItemId);
      const targetItemId = workingItemIds[index] || null;
      await moveLuggageItem(supabase, userId, desiredItemId, {
        target_group_id: group.id,
        target_item_id: targetItemId,
        insert_after: false,
      });
      workingItemIds.splice(currentIndex, 1);
      workingItemIds.splice(index, 0, desiredItemId);
      updated += 1;
    }
  }

  return { updated };
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
  const group = await requireRecord(supabase, userId, "luggage_groups", id, "id,is_required");
  assertCondition(
    !group.is_required,
    400,
    "REQUIRED_LUGGAGE_GROUP",
    "必备物品层级不能删除。",
  );
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

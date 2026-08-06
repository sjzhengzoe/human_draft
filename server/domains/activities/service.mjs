import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  enumValue,
  nextSortOrder,
  requiredText,
  requireRecord,
  UUID_PATTERN,
} from "../shared/records.mjs";

export const ACTIVITY_TYPES = ["室内", "户外", "居家"];

export async function listActivityItems(supabase, userId, query) {
  const activityType = query.activity_type
    ? enumValue(query.activity_type, ACTIVITY_TYPES, "活动分类")
    : ACTIVITY_TYPES[0];
  let request = supabase
    .from("activity_items")
    .select("*")
    .eq("user_id", userId)
    .eq("activity_type", activityType);
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("name", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取活动清单失败。");
  return data;
}

export async function createActivityItem(supabase, userId, body) {
  const activityType = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
  const { data, error } = await supabase
    .from("activity_items")
    .insert({
      user_id: userId,
      name: requiredText(body.name, "活动名称"),
      activity_type: activityType,
      sort_order: await nextSortOrder(supabase, userId, "activity_items", {
        activity_type: activityType,
      }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增活动失败。");
  return data;
}

export async function updateActivityItem(supabase, userId, id, body) {
  const existing = await requireRecord(
    supabase,
    userId,
    "activity_items",
    id,
    "id, activity_type",
  );
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "活动名称");
  if (body.activity_type !== undefined) {
    changes.activity_type = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
    if (changes.activity_type !== existing.activity_type) {
      changes.sort_order = await nextSortOrder(supabase, userId, "activity_items", {
        activity_type: changes.activity_type,
      });
    }
  }
  assertCondition(
    Object.keys(changes).length > 0,
    400,
    "NO_CHANGES",
    "没有需要更新的内容。",
  );
  const { data, error } = await supabase
    .from("activity_items")
    .update(changes)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新活动失败。");
  return data;
}

export async function deleteActivityItem(supabase, userId, id) {
  await requireRecord(supabase, userId, "activity_items", id, "id");
  const { error } = await supabase
    .from("activity_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除活动失败。");
}

export async function swapActivityItemSortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId) && sourceId !== targetId,
    400,
    "INVALID_IDS",
    "请选择两个不同的活动项目。",
  );
  const { error } = await supabase.rpc("swap_activity_item_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整活动排序失败。", {
    P0002: {
      statusCode: 404,
      code: "ACTIVITY_ITEM_NOT_FOUND",
      message: "活动项目不存在。",
    },
    "22023": {
      statusCode: 400,
      code: "INVALID_ACTIVITY_SWAP",
      message: "只能交换同一分类下的活动。",
    },
  });
  return { updated: 2 };
}

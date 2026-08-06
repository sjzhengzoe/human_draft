import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requiredText(value, fieldName, maxLength = 120) {
  assertCondition(
    typeof value === "string" && value.trim().length > 0,
    400,
    "TEXT_REQUIRED",
    `请填写${fieldName}。`,
  );
  const text = value.trim();
  assertCondition(
    text.length <= maxLength,
    400,
    "TEXT_TOO_LONG",
    `${fieldName}不能超过 ${maxLength} 个字符。`,
  );
  return text;
}

export function textArray(value, fieldName, maxItems = 30) {
  assertCondition(Array.isArray(value), 400, "INVALID_ARRAY", `${fieldName}格式无效。`);
  const items = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  assertCondition(items.length <= maxItems, 400, "TOO_MANY_ITEMS", `${fieldName}数量过多。`);
  assertCondition(
    items.every((item) => item.length <= 80),
    400,
    "ITEM_TOO_LONG",
    `${fieldName}中的单项不能超过 80 个字符。`,
  );
  return items;
}

export function enumValue(value, allowed, fieldName) {
  assertCondition(
    typeof value === "string" && allowed.includes(value),
    400,
    "INVALID_ENUM_VALUE",
    `${fieldName}无效。`,
  );
  return value;
}

export function booleanValue(value, fieldName) {
  assertCondition(typeof value === "boolean", 400, "INVALID_BOOLEAN", `${fieldName}无效。`);
  return value;
}

export function integerValue(value, fieldName, minimum, maximum) {
  assertCondition(
    Number.isInteger(value) && value >= minimum && value <= maximum,
    400,
    "INVALID_INTEGER",
    `${fieldName}必须在 ${minimum} 到 ${maximum} 之间。`,
  );
  return value;
}

export async function nextSortOrder(supabase, userId, table, filters = {}) {
  let query = supabase
    .from(table)
    .select("sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: false })
    .limit(1);
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query.maybeSingle();
  throwSupabaseError(error, "读取排序位置失败。");
  return Number(data?.sort_order || 0) + 1000;
}

export async function requireRecord(supabase, userId, table, id, fields = "*") {
  const { data, error } = await supabase
    .from(table)
    .select(fields)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取记录失败。");
  assertCondition(data, 404, "RECORD_NOT_FOUND", "记录不存在。");
  return data;
}

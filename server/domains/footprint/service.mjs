import { randomUUID } from "node:crypto";
import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  enumValue,
  requiredText,
  requireRecord,
  UUID_PATTERN,
} from "../shared/records.mjs";

const CITY_CODE_PATTERN = /^\d{6}$/;
const FOOTPRINT_PLACE_STATUSES = ["planned", "visited"];

function optionalPlaceNote(value) {
  assertCondition(
    typeof value === "string",
    400,
    "INVALID_TEXT",
    "地点备注格式无效。",
  );
  const note = value.trim();
  assertCondition(
    note.length <= 120,
    400,
    "TEXT_TOO_LONG",
    "地点备注不能超过 120 个字符。",
  );
  return note;
}

function normalizePlaceId(value) {
  assertCondition(
    typeof value === "string" && UUID_PATTERN.test(value),
    400,
    "INVALID_FOOTPRINT_PLACE_ID",
    "地点记录无效。",
  );
  return value;
}

export function normalizeFootprintCityCode(value) {
  assertCondition(
    typeof value === "string" && CITY_CODE_PATTERN.test(value),
    400,
    "INVALID_FOOTPRINT_CITY_CODE",
    "城市编码无效。",
  );
  return value;
}

export async function listFootprintCityCodes(supabase, uid) {
  const { data, error } = await supabase
    .from("user_footprint_cities")
    .select("city_code")
    .eq("uid", uid)
    .order("city_code", { ascending: true });
  throwSupabaseError(error, "读取全国足迹失败。");
  return (data || []).map((item) => item.city_code);
}

export async function setFootprintCityVisited(supabase, uid, cityCode, body = {}) {
  const normalizedCityCode = normalizeFootprintCityCode(cityCode);
  assertCondition(
    typeof body.visited === "boolean",
    400,
    "FOOTPRINT_VISITED_REQUIRED",
    "请指定城市足迹状态。",
  );
  const { error } = await supabase.rpc("set_user_footprint_city", {
    p_uid: uid,
    p_city_code: normalizedCityCode,
    p_visited: body.visited,
  });
  throwSupabaseError(error, "保存全国足迹失败。");
  return { city_code: normalizedCityCode, visited: body.visited };
}

export async function listFootprintCityPlaces(supabase, uid, cityCode) {
  const normalizedCityCode = normalizeFootprintCityCode(cityCode);
  const { data, error } = await supabase
    .from("user_footprint_city_places")
    .select("id, city_code, name, note, status, created_at, updated_at")
    .eq("uid", uid)
    .eq("city_code", normalizedCityCode)
    .order("updated_at", { ascending: false });
  throwSupabaseError(error, "读取城市地点失败。");
  return data || [];
}

export async function createFootprintCityPlace(supabase, uid, cityCode, body = {}) {
  const item = {
    id: randomUUID(),
    city_code: normalizeFootprintCityCode(cityCode),
    name: requiredText(body.name, "地点名称", 80),
    note: optionalPlaceNote(body.note ?? ""),
    status: enumValue(body.status, FOOTPRINT_PLACE_STATUSES, "地点状态"),
  };
  const { data, error } = await supabase
    .from("user_footprint_city_places")
    .insert({ ...item, uid: uid })
    .select("id, city_code, name, note, status, created_at, updated_at")
    .single();
  throwSupabaseError(error, "新增城市地点失败。");
  return data;
}

export async function updateFootprintCityPlace(supabase, uid, placeId, body = {}) {
  const id = normalizePlaceId(placeId);
  await requireRecord(
    supabase,
    uid,
    "user_footprint_city_places",
    id,
    "id",
  );
  const changes = {};
  if (body.name !== undefined) {
    changes.name = requiredText(body.name, "地点名称", 80);
  }
  if (body.note !== undefined) {
    changes.note = optionalPlaceNote(body.note);
  }
  if (body.status !== undefined) {
    changes.status = enumValue(body.status, FOOTPRINT_PLACE_STATUSES, "地点状态");
  }
  assertCondition(
    Object.keys(changes).length > 0,
    400,
    "NO_CHANGES",
    "没有需要更新的内容。",
  );
  const { data, error } = await supabase
    .from("user_footprint_city_places")
    .update(changes)
    .eq("id", id)
    .eq("uid", uid)
    .select("id, city_code, name, note, status, created_at, updated_at")
    .single();
  throwSupabaseError(error, "更新城市地点失败。");
  return data;
}

export async function deleteFootprintCityPlace(supabase, uid, placeId) {
  const id = normalizePlaceId(placeId);
  await requireRecord(
    supabase,
    uid,
    "user_footprint_city_places",
    id,
    "id",
  );
  const { error } = await supabase
    .from("user_footprint_city_places")
    .delete()
    .eq("id", id)
    .eq("uid", uid);
  throwSupabaseError(error, "删除城市地点失败。");
}

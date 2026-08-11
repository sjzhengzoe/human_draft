import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

const MAX_FOOTPRINT_CITY_COUNT = 340;
const CITY_CODE_PATTERN = /^\d{6}$/;

export function normalizeFootprintCityCode(value) {
  assertCondition(
    typeof value === "string" && CITY_CODE_PATTERN.test(value),
    400,
    "INVALID_FOOTPRINT_CITY_CODE",
    "城市编码无效。",
  );
  return value;
}

export function normalizeFootprintCityCodes(value) {
  assertCondition(
    Array.isArray(value),
    400,
    "INVALID_FOOTPRINT_CITY_CODES",
    "足迹城市列表格式无效。",
  );
  const cityCodes = [...new Set(value.map(normalizeFootprintCityCode))].sort();
  assertCondition(
    cityCodes.length <= MAX_FOOTPRINT_CITY_COUNT,
    400,
    "TOO_MANY_FOOTPRINT_CITIES",
    "足迹城市数量超出范围。",
  );
  return cityCodes;
}

export async function listFootprintCityCodes(supabase, userId) {
  const { data, error } = await supabase
    .from("user_footprint_cities")
    .select("city_code")
    .eq("user_id", userId)
    .order("city_code", { ascending: true });
  throwSupabaseError(error, "读取全国足迹失败。");
  return (data || []).map((item) => item.city_code);
}

export async function mergeFootprintCityCodes(supabase, userId, body = {}) {
  const cityCodes = normalizeFootprintCityCodes(body.city_codes);
  const { data, error } = await supabase.rpc("merge_user_footprint_cities", {
    p_user_id: userId,
    p_city_codes: cityCodes,
  });
  throwSupabaseError(error, "迁移本地足迹失败。");
  return (data || []).map((item) => item.city_code).sort();
}

export async function setFootprintCityVisited(supabase, userId, cityCode, body = {}) {
  const normalizedCityCode = normalizeFootprintCityCode(cityCode);
  assertCondition(
    typeof body.visited === "boolean",
    400,
    "FOOTPRINT_VISITED_REQUIRED",
    "请指定城市足迹状态。",
  );
  const { error } = await supabase.rpc("set_user_footprint_city", {
    p_user_id: userId,
    p_city_code: normalizedCityCode,
    p_visited: body.visited,
  });
  throwSupabaseError(error, "保存全国足迹失败。");
  return { city_code: normalizedCityCode, visited: body.visited };
}

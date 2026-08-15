import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

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

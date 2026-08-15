import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

const HOME_MODULE_KEYS = [
  "menu",
  "media",
  "activities",
  "chat-topics",
  "text-card",
  "exercise",
  "luggage",
  "wardrobe",
  "key-moments",
  "footprint",
];

const HOME_MODULE_KEY_SET = new Set(HOME_MODULE_KEYS);

export function normalizeHiddenHomeModuleKeys(value) {
  assertCondition(
    Array.isArray(value),
    400,
    "INVALID_HOME_MODULE_SETTINGS",
    "首页模块设置格式无效。",
  );

  const requestedKeys = new Set(value);
  assertCondition(
    requestedKeys.size === value.length
      && value.every((key) => typeof key === "string" && HOME_MODULE_KEY_SET.has(key)),
    400,
    "INVALID_HOME_MODULE_SETTINGS",
    "首页模块设置包含无效项目。",
  );
  assertCondition(
    requestedKeys.size < HOME_MODULE_KEYS.length,
    400,
    "HOME_MODULE_REQUIRED",
    "至少保留一个首页模块。",
  );

  return HOME_MODULE_KEYS.filter((key) => requestedKeys.has(key));
}

export async function getUserHomeModuleSettings(supabase, uid) {
  const { data, error } = await supabase
    .from("user_home_module_settings")
    .select("hidden_module_keys")
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取首页设置失败。");

  return {
    configured: Boolean(data),
    hidden_module_keys: data
      ? normalizeHiddenHomeModuleKeys(data.hidden_module_keys)
      : [],
  };
}

export async function saveUserHomeModuleSettings(supabase, uid, value) {
  const hiddenModuleKeys = normalizeHiddenHomeModuleKeys(value);
  const { data, error } = await supabase
    .from("user_home_module_settings")
    .upsert(
      { uid, hidden_module_keys: hiddenModuleKeys },
      { onConflict: "uid" },
    )
    .select("hidden_module_keys")
    .single();
  throwSupabaseError(error, "保存首页设置失败。");

  return {
    configured: true,
    hidden_module_keys: normalizeHiddenHomeModuleKeys(data.hidden_module_keys),
  };
}

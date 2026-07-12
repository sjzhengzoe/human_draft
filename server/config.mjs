const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const splitCsv = (value = "") =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeSupabaseUrl = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch (_error) {
    return trimmed;
  }
};

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: toPositiveInteger(process.env.PORT, 3000),
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL),
  supabaseSecretKey,
  dishBucket: process.env.SUPABASE_DISH_BUCKET || "dish-images",
  wardrobeBucket: process.env.SUPABASE_WARDROBE_BUCKET || "wardrobe-images",
  avatarBucket: process.env.SUPABASE_AVATAR_BUCKET || "user-avatars",
  wechatAppId: process.env.WECHAT_APP_ID || "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
  allowedOpenIds: new Set(splitCsv(process.env.WECHAT_ALLOWED_OPENIDS)),
  sessionTtlDays: toPositiveInteger(process.env.SESSION_TTL_DAYS, 30),
  maxUploadSizeMb: toPositiveInteger(process.env.MAX_UPLOAD_SIZE_MB, 10),
};

export function getMissingRuntimeConfig() {
  return [
    ["SUPABASE_URL", config.supabaseUrl],
    ["SUPABASE_SECRET_KEY", config.supabaseSecretKey],
    ["WECHAT_APP_ID", config.wechatAppId],
    ["WECHAT_APP_SECRET", config.wechatAppSecret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

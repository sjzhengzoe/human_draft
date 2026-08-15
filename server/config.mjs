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

const normalizeHostname = (value = "") => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`).hostname;
  } catch (_error) {
    return trimmed.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
};

export const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  host: process.env.HOST || "127.0.0.1",
  port: toPositiveInteger(process.env.PORT, 3000),
  supabaseUrl: normalizeSupabaseUrl(process.env.SUPABASE_URL),
  supabaseSecretKey,
  dishBucket: "dish-images",
  activityBucket: "activity-images",
  mediaCoverBucket: "media-covers",
  wardrobeBucket: "wardrobe-images",
  keyMomentBucket: "key-moment-images",
  avatarBucket: "user-avatars",
  cosSecretId: process.env.COS_SECRET_ID || "",
  cosSecretKey: process.env.COS_SECRET_KEY || "",
  cosBucket: process.env.COS_BUCKET || "",
  cosRegion: process.env.COS_REGION || "",
  cosImageDomain: normalizeHostname(process.env.COS_IMAGE_DOMAIN),
  wechatAppId: process.env.WECHAT_APP_ID || "",
  wechatAppSecret: process.env.WECHAT_APP_SECRET || "",
  adminUids: new Set(splitCsv(process.env.ADMIN_UIDS)),
  sessionTtlDays: toPositiveInteger(process.env.SESSION_TTL_DAYS, 30),
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "",
  accessTokenTtlMinutes: toPositiveInteger(process.env.ACCESS_TOKEN_TTL_MINUTES, 60),
  maxUploadSizeMb: Math.min(toPositiveInteger(process.env.MAX_UPLOAD_SIZE_MB, 10), 10),
};

export function getMissingRuntimeConfig() {
  const required = [
    ["SUPABASE_URL", config.supabaseUrl],
    ["SUPABASE_SECRET_KEY", config.supabaseSecretKey],
    ["WECHAT_APP_ID", config.wechatAppId],
    ["WECHAT_APP_SECRET", config.wechatAppSecret],
    ["ACCESS_TOKEN_SECRET", config.accessTokenSecret],
  ];
  required.push(
    ["COS_SECRET_ID", config.cosSecretId],
    ["COS_SECRET_KEY", config.cosSecretKey],
    ["COS_BUCKET", config.cosBucket],
    ["COS_REGION", config.cosRegion],
    ["COS_IMAGE_DOMAIN", config.cosImageDomain],
  );
  return required
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

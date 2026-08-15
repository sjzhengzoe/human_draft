import { createHash, randomBytes } from "node:crypto";
import { config } from "../../config.mjs";
import { assertCondition, HttpError } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { issueAccessToken, verifyAccessToken } from "./access-token.mjs";
import { resolveUserAvatarUrl } from "./profile.mjs";

const hashToken = (token) => createHash("sha256").update(token).digest("hex");

const isAdminUid = (uid) => config.adminUids.has(uid);

function requiredDisplayName(value) {
  assertCondition(
    typeof value === "string" && value.trim().length > 0,
    400,
    "DISPLAY_NAME_REQUIRED",
    "请填写昵称。",
  );
  const displayName = value.trim();
  assertCondition(
    displayName.length <= 40,
    400,
    "DISPLAY_NAME_TOO_LONG",
    "昵称不能超过 40 个字符。",
  );
  return displayName;
}

function optionalAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const avatarUrl = value.trim();
  assertCondition(
    avatarUrl.length <= 2048,
    400,
    "AVATAR_URL_TOO_LONG",
    "头像地址过长。",
  );
  try {
    const parsed = new URL(avatarUrl);
    assertCondition(
      parsed.protocol === "https:" || parsed.protocol === "http:",
      400,
      "INVALID_AVATAR_URL",
      "头像地址格式无效。",
    );
    const hostname = parsed.hostname.toLowerCase();
    assertCondition(
      ![
        "tmp",
        "localhost",
        "127.0.0.1",
        "[::1]",
        "::1",
      ].includes(hostname) && !hostname.endsWith(".local"),
      400,
      "INVALID_AVATAR_URL",
      "头像地址不能使用本地临时路径。",
    );
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID_AVATAR_URL", "头像地址格式无效。" );
  }
  return avatarUrl;
}

function getBearerToken(request) {
  const authorization = request.headers.authorization || "";
  const [scheme, token] = authorization.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : "";
}

async function exchangeWechatCode(code) {
  if (!config.wechatAppId || !config.wechatAppSecret) {
    throw new HttpError(
      503,
      "WECHAT_NOT_CONFIGURED",
      "微信登录尚未配置，请填写 WECHAT_APP_ID 和 WECHAT_APP_SECRET。",
    );
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", config.wechatAppId);
  url.searchParams.set("secret", config.wechatAppSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    const wrapped = new HttpError(502, "WECHAT_UNAVAILABLE", "微信登录服务暂时不可用。");
    wrapped.cause = error;
    throw wrapped;
  }

  const result = await response.json();
  if (!response.ok || result.errcode || !result.openid) {
    throw new HttpError(
      401,
      "WECHAT_LOGIN_FAILED",
      result.errmsg || "微信登录凭证无效，请重新登录。",
    );
  }

  return result.openid;
}

function createRefreshToken() {
  return `r1.${randomBytes(32).toString("base64url")}`;
}

function toAuthUser(user, avatarUrl = "") {
  return {
    uid: user.uid,
    display_name: user.display_name || "",
    avatar_url: avatarUrl,
    can_write: true,
    is_admin: isAdminUid(user.uid),
    created_at: user.created_at || "",
  };
}

async function createSession(supabase, user) {
  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: session, error } = await supabase
    .from("app_sessions")
    .insert({
      uid: user.uid,
      token_hash: hashToken(refreshToken),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  throwSupabaseError(error, "创建登录会话失败。");

  const access = await issueAccessToken({ sessionId: session.id, user });
  return {
    token: access.token,
    expiresAt: access.expiresAt,
    refreshToken,
    refreshExpiresAt: expiresAt,
  };
}

export async function loginWithWechatCode(supabase, code, profile = {}, options = {}) {
  assertCondition(
    typeof code === "string" && code.trim().length > 0,
    400,
    "INVALID_WECHAT_CODE",
    "缺少微信登录 code。",
  );

  const openId = await exchangeWechatCode(code.trim());
  const now = new Date().toISOString();
  const { data: existingUser, error: existingError } = await supabase
    .from("app_users")
    .select("uid, display_name, avatar_url, profile_completed, created_at")
    .eq("wechat_openid", openId)
    .maybeSingle();
  throwSupabaseError(existingError, "读取小程序账号失败。");

  let user;
  if (existingUser) {
    const changes = { last_login_at: now };
    if (typeof profile.displayName === "string" && profile.displayName.trim()) {
      changes.display_name = requiredDisplayName(profile.displayName);
    }
    const avatarUrl = optionalAvatarUrl(profile.avatarUrl);
    if (avatarUrl) {
      changes.avatar_url = avatarUrl;
      changes.profile_completed = true;
    }
    const { data, error } = await supabase
      .from("app_users")
      .update(changes)
      .eq("uid", existingUser.uid)
      .select("uid, display_name, avatar_url, profile_completed, created_at")
      .single();
    throwSupabaseError(error, "更新小程序账号失败。");
    user = data;
  } else {
    assertCondition(
      options.registrationEnabled !== false,
      503,
      "REGISTRATION_CLOSED",
      options.registrationMessage || "当前暂时停止新用户注册，请稍后再试。",
    );
    const displayName = typeof profile.displayName === "string" && profile.displayName.trim()
      ? requiredDisplayName(profile.displayName)
      : "微信用户";
    const avatarUrl = optionalAvatarUrl(profile.avatarUrl);
    const { data, error } = await supabase
      .from("app_users")
      .insert({
        wechat_openid: openId,
        display_name: displayName,
        avatar_url: avatarUrl,
        profile_completed: Boolean(avatarUrl),
        last_login_at: now,
      })
      .select("uid, display_name, avatar_url, profile_completed, created_at")
      .single();
    throwSupabaseError(error, "创建小程序账号失败。");
    user = data;
  }

  const { error: defaultsError } = await supabase.rpc("ensure_user_defaults", {
    p_uid: user.uid,
  });
  throwSupabaseError(defaultsError, "初始化个人数据失败。");

  const sessionUser = { ...user, wechat_openid: openId };
  const session = await createSession(supabase, sessionUser);
  const avatarUrl = await resolveUserAvatarUrl(user.avatar_url);

  return {
    is_new_user: !existingUser,
    token: session.token,
    expires_at: session.expiresAt,
    refresh_token: session.refreshToken,
    refresh_expires_at: session.refreshExpiresAt,
    user: toAuthUser(sessionUser, avatarUrl),
  };
}

export async function requireAuth(_supabase, request) {
  const token = getBearerToken(request);
  assertCondition(token, 401, "UNAUTHORIZED", "请先登录。" );
  const claims = await verifyAccessToken(token);
  request.auth = {
    sessionId: claims.sessionId,
    user: {
      uid: claims.uid,
      display_name: "",
      avatar_url: "",
      openid: claims.openId,
      can_write: true,
      is_admin: isAdminUid(claims.uid),
      created_at: "",
    },
  };
  return request.auth;
}

export async function requireRefreshAuth(supabase, request) {
  const refreshToken = String(request.body?.refresh_token || "");
  assertCondition(
    refreshToken.startsWith("r1.") && refreshToken.length > 20,
    401,
    "INVALID_REFRESH_TOKEN",
    "登录已过期，请重新登录。",
  );
  const tokenHash = hashToken(refreshToken);
  const { data: session, error: sessionError } = await supabase
    .from("app_sessions")
    .select(`
      id,
      uid,
      expires_at,
      user:app_users!app_sessions_uid_fkey(
        uid,
        wechat_openid,
        display_name,
        avatar_url,
        profile_completed,
        created_at
      )
    `)
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  throwSupabaseError(sessionError, "读取登录会话失败。");
  assertCondition(session, 401, "SESSION_EXPIRED", "登录已过期，请重新登录。" );
  const user = Array.isArray(session.user) ? session.user[0] : session.user;
  assertCondition(user, 401, "USER_NOT_FOUND", "账号不存在，请重新登录。" );
  request.refreshAuth = {
    session,
    tokenHash,
    user,
  };
  return request.refreshAuth;
}

export function requireWriteAccess(request) {
  assertCondition(
    request.auth?.user?.can_write,
    403,
    "READ_ONLY_ACCOUNT",
    "当前微信账号没有修改菜单的权限。",
  );
}

export async function refreshSession(supabase, refreshAuth) {
  const nextRefreshToken = createRefreshToken();
  const access = await issueAccessToken({
    sessionId: refreshAuth.session.id,
    user: refreshAuth.user,
  });
  const { data, error } = await supabase
    .from("app_sessions")
    .update({ token_hash: hashToken(nextRefreshToken) })
    .eq("id", refreshAuth.session.id)
    .eq("token_hash", refreshAuth.tokenHash)
    .select("id")
    .maybeSingle();
  throwSupabaseError(error, "刷新登录会话失败。");
  assertCondition(data, 401, "REFRESH_TOKEN_REUSED", "登录已过期，请重新登录。" );
  const avatarUrl = await resolveUserAvatarUrl(refreshAuth.user.avatar_url);
  return {
    token: access.token,
    expires_at: access.expiresAt,
    refresh_token: nextRefreshToken,
    refresh_expires_at: refreshAuth.session.expires_at,
    user: toAuthUser(refreshAuth.user, avatarUrl),
  };
}

export async function logoutSession(supabase, refreshAuth) {
  const { error } = await supabase
    .from("app_sessions")
    .delete()
    .eq("id", refreshAuth.session.id)
    .eq("token_hash", refreshAuth.tokenHash);
  throwSupabaseError(error, "退出登录失败。");
}

export async function getAuthenticatedUser(supabase, auth) {
  const { data: user, error } = await supabase
    .from("app_users")
    .select("uid, wechat_openid, display_name, avatar_url, profile_completed, created_at")
    .eq("uid", auth.user.uid)
    .maybeSingle();
  throwSupabaseError(error, "读取账号信息失败。");
  assertCondition(user, 401, "USER_NOT_FOUND", "账号不存在，请重新登录。" );
  const avatarUrl = await resolveUserAvatarUrl(user.avatar_url);
  return toAuthUser(user, avatarUrl);
}

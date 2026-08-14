import { SignJWT, jwtVerify } from "jose";
import { config } from "../../config.mjs";
import { HttpError } from "../../lib/errors.mjs";

const ISSUER = "human-draft-server";
const AUDIENCE = "human-draft-miniprogram";
const ALGORITHM = "HS256";

function signingKey() {
  if (config.accessTokenSecret.length < 32) {
    throw new HttpError(
      503,
      "ACCESS_TOKEN_NOT_CONFIGURED",
      "登录服务尚未完成安全配置。",
    );
  }
  return new TextEncoder().encode(config.accessTokenSecret);
}

export async function issueAccessToken({ sessionId, user }) {
  const expiresAt = new Date(
    Date.now() + config.accessTokenTtlMinutes * 60 * 1000,
  );
  const token = await new SignJWT({
    sid: sessionId,
    openid: user.wechat_openid,
  })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(signingKey());

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: [ALGORITHM],
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.openid !== "string"
    ) {
      throw new Error("missing access token claims");
    }
    return {
      sessionId: payload.sid,
      userId: payload.sub,
      openId: payload.openid,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(
      401,
      "SESSION_EXPIRED",
      "登录已过期，请重新登录。",
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

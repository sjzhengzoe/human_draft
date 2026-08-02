import { config } from "../config.mjs";
import { HttpError } from "./errors.mjs";
import sharp from "sharp";

const TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/token";
const MSG_CHECK_URL = "https://api.weixin.qq.com/wxa/msg_sec_check";
const IMAGE_CHECK_URL = "https://api.weixin.qq.com/wxa/img_sec_check";
const TEXT_CHUNK_LENGTH = 2_000;
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1_000;
const INVALID_TOKEN_CODES = new Set([40014, 42001]);
const IMAGE_CHECK_DIRECT_SIZE_LIMIT = 900 * 1024;

const unsafeContentError = () =>
  new HttpError(
    400,
    "CONTENT_UNSAFE",
    "内容含违规信息，请修改后重试。",
  );

const unavailableError = (cause) => {
  const error = new HttpError(
    502,
    "CONTENT_SECURITY_UNAVAILABLE",
    "内容安全检测暂不可用，请稍后重试。",
  );
  error.cause = cause;
  return error;
};

function splitText(content) {
  const characters = Array.from(content.trim());
  const chunks = [];
  for (let index = 0; index < characters.length; index += TEXT_CHUNK_LENGTH) {
    chunks.push(characters.slice(index, index + TEXT_CHUNK_LENGTH).join(""));
  }
  return chunks;
}

async function imageForSecurityCheck(image) {
  const buffer = Buffer.isBuffer(image) ? image : image?.buffer;
  if (!buffer?.length || buffer.length <= IMAGE_CHECK_DIRECT_SIZE_LIMIT) {
    return {
      buffer,
      mimetype: image?.mimetype || "image/png",
      filename: image?.filename || "upload.png",
    };
  }

  try {
    const compressed = await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize({ width: 1_024, height: 1_024, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    return {
      buffer: compressed,
      mimetype: "image/jpeg",
      filename: "security-check.jpg",
    };
  } catch (cause) {
    const error = new HttpError(
      400,
      "INVALID_IMAGE",
      "图片文件损坏或格式不受支持。",
    );
    error.cause = cause;
    throw error;
  }
}

export function createWechatContentSecurity(options = {}) {
  const appId = options.appId ?? config.wechatAppId;
  const appSecret = options.appSecret ?? config.wechatAppSecret;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let cachedToken = "";
  let tokenExpiresAt = 0;

  const clearToken = () => {
    cachedToken = "";
    tokenExpiresAt = 0;
  };

  const getAccessToken = async () => {
    if (
      cachedToken &&
      Date.now() < tokenExpiresAt - TOKEN_REFRESH_MARGIN_MS
    ) {
      return cachedToken;
    }
    if (!appId || !appSecret || typeof fetchImpl !== "function") {
      throw unavailableError(new Error("微信内容安全服务未配置"));
    }

    const url = new URL(TOKEN_URL);
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);

    let response;
    let result;
    try {
      response = await fetchImpl(url, {
        signal: AbortSignal.timeout(10_000),
      });
      result = await response.json();
    } catch (error) {
      if (allowRetry) return requestCheck(endpoint, createRequest, false);
      throw unavailableError(error);
    }

    if (!response.ok || result.errcode || !result.access_token) {
      throw unavailableError(
        new Error(result.errmsg || "获取微信 access_token 失败"),
      );
    }

    cachedToken = result.access_token;
    tokenExpiresAt =
      Date.now() + Math.max(Number(result.expires_in) || 7_200, 600) * 1_000;
    return cachedToken;
  };

  const requestCheck = async (endpoint, createRequest, allowRetry = true) => {
    const accessToken = await getAccessToken();
    const url = new URL(endpoint);
    url.searchParams.set("access_token", accessToken);

    let response;
    let result;
    try {
      response = await fetchImpl(url, {
        ...createRequest(),
        signal: AbortSignal.timeout(15_000),
      });
      result = await response.json();
    } catch (error) {
      throw unavailableError(error);
    }

    if (allowRetry && INVALID_TOKEN_CODES.has(Number(result.errcode))) {
      clearToken();
      return requestCheck(endpoint, createRequest, false);
    }
    if (allowRetry && (response.status >= 500 || Number(result.errcode) === -1)) {
      return requestCheck(endpoint, createRequest, false);
    }
    if (!response.ok) {
      throw unavailableError(new Error(`微信内容安全接口返回 ${response.status}`));
    }
    return result;
  };

  const checkText = async (openId, content) => {
    if (typeof content !== "string" || !content.trim()) return;

    for (const chunk of splitText(content)) {
      const result = await requestCheck(MSG_CHECK_URL, () => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: chunk,
          version: 2,
          scene: 4,
          openid: openId,
        }),
      }));

      if (Number(result.errcode) === 87014) throw unsafeContentError();
      if (result.errcode || result.result?.suggest !== "pass") {
        if (result.result?.suggest === "risky" || result.result?.suggest === "review") {
          throw unsafeContentError();
        }
        throw unavailableError(
          new Error(result.errmsg || "微信文字内容安全检测失败"),
        );
      }
    }
  };

  const checkImage = async (image) => {
    const prepared = await imageForSecurityCheck(image);
    if (!prepared.buffer?.length) return;

    const result = await requestCheck(IMAGE_CHECK_URL, () => {
      const body = new FormData();
      body.append(
        "media",
        new Blob([prepared.buffer], { type: prepared.mimetype }),
        prepared.filename,
      );
      return { method: "POST", body };
    });

    if (Number(result.errcode) === 87014) throw unsafeContentError();
    if (result.errcode) {
      throw unavailableError(
        new Error(result.errmsg || "微信图片内容安全检测失败"),
      );
    }
  };

  return { checkText, checkImage };
}

export const wechatContentSecurity = createWechatContentSecurity();

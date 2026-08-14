import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { config } from "../../config.mjs";
import { assertCondition, HttpError } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  createSignedUrlMap,
  removeStorageImages,
  uploadStorageImage,
  USER_IMAGE_SIGNED_URL_TTL_SECONDS,
} from "../shared/image-storage.mjs";

const ALLOWED_IMAGE_TYPES = new Set([
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function avatarStoragePath(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  const text = value.trim();
  return text.includes("://") ? "" : text.replace(/^\/+/, "");
}

export async function resolveUserAvatarUrl(value) {
  const path = avatarStoragePath(value);
  if (!path) return typeof value === "string" ? value : "";
  const urls = await createSignedUrlMap({
    bucketName: config.avatarBucket,
    paths: [path],
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取头像失败。",
  });
  return urls.get(path) || "";
}

export async function readAvatarImage(request) {
  let image;

  for await (const part of request.parts()) {
    if (part.type !== "file" || part.fieldname !== "avatar") {
      if (part.type === "file") part.file.resume();
      continue;
    }
    assertCondition(!image, 400, "MULTIPLE_AVATARS", "一次只能上传一张头像。" );
    assertCondition(
      ALLOWED_IMAGE_TYPES.has(part.mimetype),
      415,
      "UNSUPPORTED_AVATAR_TYPE",
      "头像仅支持 PNG、JPEG 或 WebP 图片。",
    );
    const chunks = [];
    for await (const chunk of part.file) chunks.push(chunk);
    assertCondition(!part.file.truncated, 413, "AVATAR_TOO_LARGE", "头像文件过大。" );
    image = Buffer.concat(chunks);
  }

  assertCondition(image?.length, 400, "AVATAR_REQUIRED", "请选择头像。" );
  return image;
}

async function normalizeAvatar(buffer) {
  try {
    return await sharp(buffer, { failOn: "error" })
      .rotate()
      .resize(320, 320, { fit: "cover", position: "attention" })
      .webp({ quality: 86, alphaQuality: 92 })
      .toBuffer();
  } catch (error) {
    const wrapped = new HttpError(400, "INVALID_AVATAR", "头像文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function updateUserAvatar(supabase, userId, buffer) {
  const { data: currentUser, error: currentUserError } = await supabase
    .from("app_users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  throwSupabaseError(currentUserError, "读取当前头像失败。" );
  assertCondition(currentUser, 404, "USER_NOT_FOUND", "账号不存在。" );

  const previousPath = avatarStoragePath(currentUser.avatar_url);
  const path = `users/${userId}/avatar-${Date.now()}-${randomUUID()}.webp`;
  const normalized = await normalizeAvatar(buffer);
  try {
    await uploadStorageImage(supabase, {
      bucketName: config.avatarBucket,
      path,
      userId,
      buffer: normalized,
      cacheControl: "0",
      contentType: "image/webp",
    });
  } catch (error) {
    const wrapped = new HttpError(500, "AVATAR_UPLOAD_FAILED", "保存头像失败。" );
    wrapped.cause = error;
    throw wrapped;
  }

  const urls = await createSignedUrlMap({
    bucketName: config.avatarBucket,
    paths: [path],
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取头像失败。",
  });
  const avatarUrl = urls.get(path) || "";
  const { error: updateError } = await supabase
    .from("app_users")
    .update({ avatar_url: path, profile_completed: true })
    .eq("id", userId);
  if (updateError) {
    await removeStorageImages(supabase, {
      bucketName: config.avatarBucket,
      paths: [path],
      userId,
      errorMessage: "清理未完成上传的头像失败。",
    });
    throwSupabaseError(updateError, "更新头像失败。" );
  }
  if (previousPath && previousPath !== path) {
    await removeStorageImages(supabase, {
      bucketName: config.avatarBucket,
      paths: [previousPath],
      userId,
      errorMessage: "清理旧头像失败。",
    });
  }
  return avatarUrl;
}

export async function updateUserDisplayName(supabase, userId, value) {
  assertCondition(
    typeof value === "string" && value.trim().length > 0,
    400,
    "DISPLAY_NAME_REQUIRED",
    "请填写昵称。",
  );
  const displayName = value.trim();
  assertCondition(
    Array.from(displayName).length <= 40,
    400,
    "DISPLAY_NAME_TOO_LONG",
    "昵称不能超过 40 个字符。",
  );
  const { data: user, error } = await supabase
    .from("app_users")
    .update({ display_name: displayName, profile_completed: true })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  throwSupabaseError(error, "更新昵称失败。" );
  assertCondition(user, 404, "USER_NOT_FOUND", "账号不存在。" );
  return displayName;
}

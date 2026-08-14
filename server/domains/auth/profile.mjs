import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { assertCondition } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import { readMultipartImage } from "../../http/multipart-image.mjs";
import {
  createSignedUrlMap,
  removeStorageImages,
  uploadStandardImage,
  USER_IMAGE_SIGNED_URL_TTL_SECONDS,
} from "../shared/image-storage.mjs";

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
  const { image } = await readMultipartImage(request, { fieldName: "avatar" });
  assertCondition(image?.buffer?.length, 400, "AVATAR_REQUIRED", "请选择头像。" );
  return image;
}

export async function updateUserAvatar(supabase, userId, image) {
  const { data: currentUser, error: currentUserError } = await supabase
    .from("app_users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  throwSupabaseError(currentUserError, "读取当前头像失败。" );
  assertCondition(currentUser, 404, "USER_NOT_FOUND", "账号不存在。" );

  const previousPath = avatarStoragePath(currentUser.avatar_url);
  const { imagePath: path } = await uploadStandardImage(supabase, {
    bucketName: config.avatarBucket,
    basePath: `users/${userId}/avatar-${Date.now()}-${randomUUID()}`,
    userId,
    buffer: image.buffer,
    crop: image.crop,
    cacheControl: "0",
    uploadErrorMessage: "保存头像失败。",
  });

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

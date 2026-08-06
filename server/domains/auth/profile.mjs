import sharp from "sharp";
import { config } from "../../config.mjs";
import { assertCondition, HttpError } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

const ALLOWED_IMAGE_TYPES = new Set([
  "application/octet-stream",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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
  const path = `users/${userId}/avatar.webp`;
  const normalized = await normalizeAvatar(buffer);
  const { error: uploadError } = await supabase.storage
    .from(config.avatarBucket)
    .upload(path, normalized, {
      cacheControl: "0",
      contentType: "image/webp",
      upsert: true,
    });
  if (uploadError) {
    const wrapped = new HttpError(500, "AVATAR_UPLOAD_FAILED", "保存头像失败。" );
    wrapped.cause = uploadError;
    throw wrapped;
  }

  const publicUrl = supabase.storage.from(config.avatarBucket).getPublicUrl(path).data.publicUrl;
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("app_users")
    .update({ avatar_url: avatarUrl, profile_completed: true })
    .eq("id", userId);
  throwSupabaseError(updateError, "更新头像失败。" );
  return avatarUrl;
}

import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { HttpError } from "../../lib/errors.mjs";
import {
  optimizeOriginalImage,
  optimizedImagePaths,
} from "../../lib/image-processing.mjs";

export function dishImagePublicUrl(supabase, path) {
  if (!path) return "";
  return supabase.storage.from(config.dishBucket).getPublicUrl(path).data.publicUrl;
}

async function normalizeDishImage(buffer) {
  try {
    return await optimizeOriginalImage(buffer);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function uploadDishImage(supabase, userId, dishId, buffer) {
  const revision = randomUUID();
  const basePath = `users/${userId}/dishes/${dishId}/${revision}`;
  const { imagePath } = optimizedImagePaths(basePath);
  const { original, originalContentType } = await normalizeDishImage(buffer);

  const { error } = await supabase.storage
    .from(config.dishBucket)
    .upload(imagePath, original, {
      cacheControl: "31536000",
      contentType: originalContentType,
      upsert: false,
    });
  if (error) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", "上传菜品图片失败。" );
    wrapped.cause = error;
    throw wrapped;
  }

  return { imagePath, thumbnailPath: null };
}

export async function copyDishImageToScheduleArchive(supabase, userId, sourceId, path) {
  if (!path) return "";
  const extension = path.match(/(\.[a-z0-9]+)$/i)?.[1] || ".webp";
  const archivePath = `users/${userId}/menu-schedule-archives/${sourceId}/${randomUUID()}${extension}`;
  const { error } = await supabase.storage
    .from(config.dishBucket)
    .copy(path, archivePath);
  if (error) {
    const wrapped = new HttpError(500, "MENU_ARCHIVE_IMAGE_FAILED", "保存菜单历史图片失败。" );
    wrapped.cause = error;
    throw wrapped;
  }
  return archivePath;
}

export async function removeDishImages(supabase, paths) {
  const validPaths = paths.filter(Boolean);
  if (validPaths.length === 0) return;
  const { error } = await supabase.storage.from(config.dishBucket).remove(validPaths);
  if (error) console.error("删除 Storage 图片失败:", error);
}

import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { HttpError } from "../../lib/errors.mjs";
import {
  IMAGE_PROFILES,
  optimizeOriginalImage,
  optimizedImagePaths,
} from "../../lib/image-processing.mjs";
import {
  copyStorageImage,
  createSignedUrlMap,
  PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
  removeStorageImages,
  uploadStorageImage,
  USER_IMAGE_SIGNED_URL_TTL_SECONDS,
} from "../shared/image-storage.mjs";

export function dishImageUrl(urls, path) {
  if (!path) return "";
  return urls.get(path) || "";
}

export function createDishImageUrlMap(supabase, paths) {
  return createSignedUrlMap(supabase, {
    bucketName: config.dishBucket,
    paths,
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取菜单图片失败。",
  });
}

async function normalizeDishImage(buffer) {
  try {
    return await optimizeOriginalImage(buffer, IMAGE_PROFILES.dish.original);
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

  try {
    await uploadStorageImage(supabase, {
      bucketName: config.dishBucket,
      path: imagePath,
      buffer: original,
      cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: originalContentType,
      upsert: false,
    });
  } catch (error) {
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
  await copyStorageImage(supabase, {
    bucketName: config.dishBucket,
    sourcePath: path,
    destinationPath: archivePath,
    errorMessage: "保存菜单历史图片失败。",
  });
  return archivePath;
}

export async function removeDishImages(supabase, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.dishBucket,
    paths,
    errorMessage: "删除 Storage 图片失败:",
  });
}

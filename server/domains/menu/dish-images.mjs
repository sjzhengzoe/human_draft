import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import {
  copyStorageImage,
  createSignedUrlMap,
  removeStorageImages,
  uploadStandardImage,
  USER_IMAGE_SIGNED_URL_TTL_SECONDS,
} from "../shared/image-storage.mjs";

export function dishImageUrl(urls, path) {
  if (!path) return "";
  return urls.get(path) || "";
}

export function createDishImageUrlMap(paths) {
  return createSignedUrlMap({
    bucketName: config.dishBucket,
    paths,
    expiresIn: USER_IMAGE_SIGNED_URL_TTL_SECONDS,
    errorMessage: "读取菜单图片失败。",
  });
}

export async function uploadDishImage(supabase, userId, dishId, image) {
  return uploadStandardImage(supabase, {
    bucketName: config.dishBucket,
    basePath: `users/${userId}/dishes/${dishId}/${randomUUID()}`,
    userId,
    buffer: image.buffer,
    crop: image.crop,
    uploadErrorMessage: "上传菜品图片失败。",
  });
}

export async function copyDishImageToScheduleArchive(supabase, userId, sourceId, path) {
  if (!path) return "";
  const extension = path.match(/(\.[a-z0-9]+)$/i)?.[1] || ".webp";
  const archivePath = `users/${userId}/menu-schedule-archives/${sourceId}/${randomUUID()}${extension}`;
  await copyStorageImage(supabase, {
    bucketName: config.dishBucket,
    sourcePath: path,
    destinationPath: archivePath,
    userId,
    errorMessage: "保存菜单历史图片失败。",
  });
  return archivePath;
}

export async function removeDishImages(supabase, userId, paths) {
  return removeStorageImages(supabase, {
    bucketName: config.dishBucket,
    paths,
    userId,
    errorMessage: "删除 Storage 图片失败:",
  });
}

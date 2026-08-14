import { HttpError } from "../../lib/errors.mjs";
import { config } from "../../config.mjs";
import {
  copyCosObject,
  cosObjectKey,
  deleteCosObject,
  getCosSignedObjectUrl,
  putCosObject,
} from "../../lib/cos-storage.mjs";
import {
  optimizeOriginalImage,
  optimizedImagePaths,
} from "../../lib/image-processing.mjs";

export const USER_IMAGE_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
export const PRIVATE_IMAGE_CACHE_CONTROL_SECONDS = "3600";

const IMAGE_MODULE_BY_BUCKET = new Map([
  [config.dishBucket, "menu"],
  [config.activityBucket, "activities"],
  [config.mediaCoverBucket, "media"],
  [config.wardrobeBucket, "wardrobe"],
  [config.keyMomentBucket, "key_moments"],
  [config.avatarBucket, "avatars"],
]);

const numericObjectSize = (value) => {
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? Math.round(size) : 0;
};

export async function getUserImageStorageUsage(supabase, userId) {
  const { data, error } = await supabase.rpc("get_user_image_storage_usage", {
    p_user_id: userId,
  });
  if (error) throw error;
  const modules = (data || []).map((row) => ({
    key: row.module,
    image_count: Number(row.image_count || 0),
    used_bytes: numericObjectSize(row.used_bytes),
  }));

  return {
    plan: "public_beta",
    used_bytes: modules.reduce((total, module) => total + module.used_bytes, 0),
    image_count: modules.reduce((total, module) => total + module.image_count, 0),
    quota_bytes: null,
    modules,
  };
}

export async function uploadStorageImage(
  supabase,
  { bucketName, path, userId, buffer, contentType, cacheControl },
) {
  const module = IMAGE_MODULE_BY_BUCKET.get(bucketName);
  if (!module) throw new Error(`Unknown image bucket: ${bucketName}`);
  const objectKey = cosObjectKey(bucketName, path);
  await putCosObject({ key: objectKey, buffer, contentType, cacheControl });
  const { error } = await supabase.from("image_assets").upsert({
    object_key: objectKey,
    user_id: userId,
    module,
    size_bytes: buffer.length,
    mime_type: contentType,
  }, { onConflict: "object_key" });
  if (!error) return;
  try {
    await deleteCosObject(objectKey);
  } catch (cleanupError) {
    console.error("回滚未登记的 COS 图片失败:", cleanupError);
  }
  throw error;
}

export async function uploadOptimizedOriginalImage(
  supabase,
  { bucketName, basePath, userId, buffer, profile, uploadErrorMessage },
) {
  let optimized;
  try {
    optimized = await optimizeOriginalImage(buffer, profile);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }

  const { imagePath } = optimizedImagePaths(basePath);
  try {
    await uploadStorageImage(supabase, {
      bucketName,
      path: imagePath,
      userId,
      buffer: optimized.original,
      cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: optimized.originalContentType,
    });
  } catch (error) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", uploadErrorMessage);
    wrapped.cause = error;
    throw wrapped;
  }
  return { imagePath };
}

export async function createSignedUrlMap({ bucketName, paths, expiresIn, errorMessage }) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();

  try {
    const pairs = await Promise.all(uniquePaths.map(async (path) => [
      path,
      await getCosSignedObjectUrl(cosObjectKey(bucketName, path), expiresIn),
    ]));
    return new Map(pairs);
  } catch (error) {
    const wrapped = new HttpError(500, "IMAGE_URL_FAILED", errorMessage);
    wrapped.cause = error;
    throw wrapped;
  }
}

export async function removeStorageImages(
  supabase,
  { bucketName, paths, userId, errorMessage },
) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;
  for (const path of validPaths) {
    const objectKey = cosObjectKey(bucketName, path);
    try {
      await deleteCosObject(objectKey);
      const { error } = await supabase
        .from("image_assets")
        .delete()
        .eq("object_key", objectKey)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (error) {
      console.error(errorMessage, error);
    }
  }
}

export async function copyStorageImage(
  supabase,
  { bucketName, sourcePath, destinationPath, userId, errorMessage },
) {
  const destinationKey = cosObjectKey(bucketName, destinationPath);
  try {
    const buffer = await copyCosObject(
      cosObjectKey(bucketName, sourcePath),
      destinationKey,
      { cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS },
    );
    const module = IMAGE_MODULE_BY_BUCKET.get(bucketName);
    if (!module) throw new Error(`Unknown image bucket: ${bucketName}`);
    const { error } = await supabase.from("image_assets").upsert({
      object_key: destinationKey,
      user_id: userId,
      module,
      size_bytes: buffer.length,
      mime_type: "image/webp",
    }, { onConflict: "object_key" });
    if (error) throw error;
  } catch (error) {
    try {
      await deleteCosObject(destinationKey);
    } catch (_cleanupError) {
      // Copy failures before object creation have nothing to clean up.
    }
    const wrapped = new HttpError(500, "IMAGE_COPY_FAILED", errorMessage);
    wrapped.cause = error;
    throw wrapped;
  }
}

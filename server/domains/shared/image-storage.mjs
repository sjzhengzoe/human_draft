import { HttpError } from "../../lib/errors.mjs";
import { config } from "../../config.mjs";
import {
  copyCosObject,
  cosObjectKey,
  deleteCosObject,
  getCosObject,
  getCosSignedObjectUrl,
  putCosObject,
} from "../../lib/cos-storage.mjs";
import {
  optimizeImage,
  standardImagePath,
} from "../../lib/image-processing.mjs";

export const USER_IMAGE_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
export const PRIVATE_IMAGE_CACHE_CONTROL_SECONDS = "3600";
export const DEFAULT_IMAGE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;
export const DEFAULT_IMAGE_STORAGE_WARNING_BYTES = 80 * 1024 * 1024;

const userStorageLocks = new Map();

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

export async function getUserImageStorageUsage(supabase, uid) {
  const { data, error } = await supabase.rpc("get_user_image_storage_usage", {
    p_uid: uid,
  });
  if (error) throw error;
  const modules = (data || []).map((row) => ({
    key: row.module,
    image_count: Number(row.image_count || 0),
    used_bytes: numericObjectSize(row.used_bytes),
  }));
  const quotaBytes = numericObjectSize(data?.[0]?.quota_bytes)
    || DEFAULT_IMAGE_STORAGE_QUOTA_BYTES;
  const warningBytes = numericObjectSize(data?.[0]?.warning_bytes)
    || DEFAULT_IMAGE_STORAGE_WARNING_BYTES;
  const usedBytes = modules.reduce((total, module) => total + module.used_bytes, 0);

  return {
    plan: "public_beta",
    used_bytes: usedBytes,
    image_count: modules.reduce((total, module) => total + module.image_count, 0),
    quota_bytes: quotaBytes,
    warning_bytes: warningBytes,
    remaining_bytes: Math.max(0, quotaBytes - usedBytes),
    is_near_limit: usedBytes >= warningBytes,
    is_over_limit: usedBytes >= quotaBytes,
    modules,
  };
}

async function withUserStorageLock(uid, action) {
  const previous = userStorageLocks.get(uid) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.catch(() => {}).then(() => gate);
  userStorageLocks.set(uid, queued);
  await previous.catch(() => {});
  try {
    return await action();
  } finally {
    release();
    if (userStorageLocks.get(uid) === queued) userStorageLocks.delete(uid);
  }
}

async function replacementBytes(supabase, uid, bucketName, paths = []) {
  const keys = [...new Set(paths.filter(Boolean).map((path) => cosObjectKey(bucketName, path)))];
  if (!keys.length) return 0;
  const { data, error } = await supabase
    .from("image_assets")
    .select("object_key, size_bytes")
    .eq("uid", uid)
    .in("object_key", keys);
  if (error) throw error;
  return (data || []).reduce((total, row) => total + numericObjectSize(row.size_bytes), 0);
}

async function assertImageStorageCapacity(
  supabase,
  { uid, bucketName, incomingBytes, replacedPaths },
) {
  const [usage, releasedBytes] = await Promise.all([
    getUserImageStorageUsage(supabase, uid),
    replacementBytes(supabase, uid, bucketName, replacedPaths),
  ]);
  const projectedBytes = Math.max(0, usage.used_bytes - releasedBytes) + incomingBytes;
  if (projectedBytes <= usage.quota_bytes) return;
  throw new HttpError(
    409,
    "IMAGE_STORAGE_QUOTA_EXCEEDED",
    "图片空间已达到 100 MB，请删除部分图片后再试。",
    {
      used_bytes: usage.used_bytes,
      quota_bytes: usage.quota_bytes,
      required_bytes: Math.max(0, projectedBytes - usage.quota_bytes),
    },
  );
}

export async function uploadStorageImage(
  supabase,
  { bucketName, path, uid, buffer, contentType, cacheControl, replacedPaths = [] },
) {
  return withUserStorageLock(uid, async () => {
    const module = IMAGE_MODULE_BY_BUCKET.get(bucketName);
    if (!module) throw new Error(`Unknown image bucket: ${bucketName}`);
    await assertImageStorageCapacity(supabase, {
      uid,
      bucketName,
      incomingBytes: buffer.length,
      replacedPaths,
    });
    const objectKey = cosObjectKey(bucketName, path);
    await putCosObject({ key: objectKey, buffer, contentType, cacheControl });
    const { error } = await supabase.from("image_assets").upsert({
      object_key: objectKey,
      uid: uid,
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
  });
}

export async function uploadStandardImage(
  supabase,
  {
    bucketName,
    basePath,
    uid,
    buffer,
    crop,
    cacheControl,
    uploadErrorMessage,
    replacedPaths = [],
  },
) {
  let optimized;
  try {
    optimized = await optimizeImage(buffer, crop);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }

  const imagePath = standardImagePath(basePath);
  try {
    await uploadStorageImage(supabase, {
      bucketName,
      path: imagePath,
      uid,
      buffer: optimized.buffer,
      cacheControl: cacheControl ?? PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: optimized.contentType,
      replacedPaths,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
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
  { bucketName, paths, uid, errorMessage },
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
        .eq("uid", uid);
      if (error) throw error;
    } catch (error) {
      console.error(errorMessage, error);
    }
  }
}

export async function copyStorageImage(
  supabase,
  { bucketName, sourcePath, destinationPath, uid, errorMessage, replacedPaths = [] },
) {
  const sourceKey = cosObjectKey(bucketName, sourcePath);
  const destinationKey = cosObjectKey(bucketName, destinationPath);
  try {
    await withUserStorageLock(uid, async () => {
      const { data: sourceAsset, error: sourceError } = await supabase
        .from("image_assets")
        .select("size_bytes, mime_type")
        .eq("object_key", sourceKey)
        .eq("uid", uid)
        .maybeSingle();
      if (sourceError) throw sourceError;
      const fallbackBuffer = sourceAsset ? null : await getCosObject(sourceKey);
      const sourceBytes = numericObjectSize(sourceAsset?.size_bytes)
        || fallbackBuffer?.length
        || 0;
      await assertImageStorageCapacity(supabase, {
        uid,
        bucketName,
        incomingBytes: sourceBytes,
        replacedPaths,
      });
      await copyCosObject(sourceKey, destinationKey);
      const { error: ledgerError } = await supabase.from("image_assets").upsert({
        object_key: destinationKey,
        uid,
        module: IMAGE_MODULE_BY_BUCKET.get(bucketName),
        size_bytes: sourceBytes,
        mime_type: sourceAsset?.mime_type || "image/webp",
      }, { onConflict: "object_key" });
      if (ledgerError) throw ledgerError;
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
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

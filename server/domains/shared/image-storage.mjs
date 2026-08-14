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

export const usesCosImageStorage = () => config.imageStorageProvider === "cos";

export async function uploadStorageImage(
  supabase,
  { bucketName, path, buffer, contentType, cacheControl, upsert = false },
) {
  if (usesCosImageStorage()) {
    await putCosObject({
      key: cosObjectKey(bucketName, path),
      buffer,
      contentType,
      cacheControl,
    });
    return;
  }
  const { error } = await supabase.storage.from(bucketName).upload(path, buffer, {
    cacheControl,
    contentType,
    upsert,
  });
  if (error) throw error;
}

export async function uploadOptimizedOriginalImage(
  supabase,
  { bucketName, basePath, buffer, profile, uploadErrorMessage },
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
      buffer: optimized.original,
      cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: optimized.originalContentType,
      upsert: false,
    });
  } catch (error) {
    const wrapped = new HttpError(500, "IMAGE_UPLOAD_FAILED", uploadErrorMessage);
    wrapped.cause = error;
    throw wrapped;
  }
  return { imagePath, thumbnailPath: null };
}

export async function createSignedUrlMap(
  supabase,
  { bucketName, paths, expiresIn, errorMessage },
) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();

  if (usesCosImageStorage()) {
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

  const chunks = [];
  for (let index = 0; index < uniquePaths.length; index += 100) {
    chunks.push(uniquePaths.slice(index, index + 100));
  }
  const results = await Promise.all(chunks.map((chunk) =>
    supabase.storage.from(bucketName).createSignedUrls(chunk, expiresIn)
  ));
  const urls = new Map();
  results.forEach(({ data, error }, chunkIndex) => {
    if (error) {
      const wrapped = new HttpError(500, "IMAGE_URL_FAILED", errorMessage);
      wrapped.cause = error;
      throw wrapped;
    }
    (data || []).forEach((item, itemIndex) => {
      const path = item.path || chunks[chunkIndex][itemIndex];
      urls.set(path, item.signedUrl || "");
    });
  });
  return urls;
}

export async function removeStorageImages(
  supabase,
  { bucketName, paths, errorMessage },
) {
  const validPaths = paths.filter(Boolean);
  if (!validPaths.length) return;
  if (usesCosImageStorage()) {
    try {
      await Promise.all(validPaths.map((path) => deleteCosObject(cosObjectKey(bucketName, path))));
    } catch (error) {
      console.error(errorMessage, error);
    }
    return;
  }
  const { error } = await supabase.storage.from(bucketName).remove(validPaths);
  if (error) console.error(errorMessage, error);
}

export async function copyStorageImage(
  supabase,
  { bucketName, sourcePath, destinationPath, errorMessage },
) {
  try {
    if (usesCosImageStorage()) {
      await copyCosObject(
        cosObjectKey(bucketName, sourcePath),
        cosObjectKey(bucketName, destinationPath),
        { cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS },
      );
      return;
    }
    const { error } = await supabase.storage
      .from(bucketName)
      .copy(sourcePath, destinationPath);
    if (error) throw error;
  } catch (error) {
    const wrapped = new HttpError(500, "IMAGE_COPY_FAILED", errorMessage);
    wrapped.cause = error;
    throw wrapped;
  }
}

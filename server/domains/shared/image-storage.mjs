import { HttpError } from "../../lib/errors.mjs";
import { optimizeImage, optimizedImagePaths } from "../../lib/image-processing.mjs";

export const USER_IMAGE_SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
export const PRIVATE_IMAGE_CACHE_CONTROL_SECONDS = "3600";

export async function uploadOptimizedImagePair(
  supabase,
  {
    bucketName,
    basePath,
    buffer,
    profile,
    uploadErrorMessage,
    thumbnailErrorMessage,
  },
) {
  let optimized;
  try {
    optimized = await optimizeImage(buffer, profile);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。" );
    wrapped.cause = error;
    throw wrapped;
  }

  const { imagePath, thumbnailPath } = optimizedImagePaths(basePath);
  const bucket = supabase.storage.from(bucketName);
  const [imageResult, thumbnailResult] = await Promise.all([
    bucket.upload(imagePath, optimized.original, {
      cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: optimized.originalContentType,
      upsert: false,
    }),
    bucket.upload(thumbnailPath, optimized.thumbnail, {
      cacheControl: PRIVATE_IMAGE_CACHE_CONTROL_SECONDS,
      contentType: optimized.thumbnailContentType,
      upsert: false,
    }),
  ]);
  if (imageResult.error || thumbnailResult.error) {
    await bucket.remove([imagePath, thumbnailPath]);
    const imageFailed = Boolean(imageResult.error);
    const wrapped = new HttpError(
      500,
      imageFailed ? "IMAGE_UPLOAD_FAILED" : "THUMBNAIL_UPLOAD_FAILED",
      imageFailed ? uploadErrorMessage : thumbnailErrorMessage,
    );
    wrapped.cause = imageResult.error || thumbnailResult.error;
    throw wrapped;
  }

  return { imagePath, thumbnailPath };
}

export async function createSignedUrlMap(
  supabase,
  { bucketName, paths, expiresIn, errorMessage },
) {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();

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
  const { error } = await supabase.storage.from(bucketName).remove(validPaths);
  if (error) console.error(errorMessage, error);
}

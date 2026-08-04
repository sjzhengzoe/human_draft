import sharp from "sharp";

export const IMAGE_STORAGE_VERSION = "normalized-v3";
export const IMAGE_COMPRESSION_PERCENT = 0;

export const IMAGE_PROFILES = Object.freeze({
  dish: Object.freeze({
    original: Object.freeze({}),
    thumbnail: Object.freeze({ width: 720, height: 480 }),
  }),
  wardrobe: Object.freeze({
    original: Object.freeze({}),
    thumbnail: Object.freeze({ width: 480, height: 480 }),
  }),
  keyMoment: Object.freeze({
    original: Object.freeze({}),
    thumbnail: Object.freeze({ width: 900, height: 900 }),
  }),
});

function toWebp(source, options) {
  let output = source.clone();
  if (options.width && options.height) {
    output = output.resize({
      width: options.width,
      height: options.height,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  if (IMAGE_COMPRESSION_PERCENT === 0) {
    return output.webp({ lossless: true, effort: 4 }).toBuffer();
  }

  const quality = Math.max(1, Math.min(100, 100 - IMAGE_COMPRESSION_PERCENT));
  return output
    .webp({
      quality,
      alphaQuality: quality,
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}

export async function optimizeImage(buffer, profile) {
  const source = sharp(buffer, { failOn: "error" }).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
  }

  const [original, thumbnail] = await Promise.all([
    toWebp(source, profile.original),
    toWebp(source, profile.thumbnail),
  ]);

  return {
    original,
    thumbnail,
    originalContentType: "image/webp",
    thumbnailContentType: "image/webp",
  };
}

export function optimizedImagePaths(basePath) {
  return {
    imagePath: `${basePath}-${IMAGE_STORAGE_VERSION}.webp`,
    thumbnailPath: `${basePath}-${IMAGE_STORAGE_VERSION}-thumbnail.webp`,
  };
}

export function isOptimizedImagePath(path) {
  return typeof path === "string" && path.endsWith(`-${IMAGE_STORAGE_VERSION}.webp`);
}

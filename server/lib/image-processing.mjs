import sharp from "sharp";
import { HttpError } from "./errors.mjs";

export const IMAGE_STORAGE_VERSION = "cost-v4";
export const MAX_IMAGE_PIXELS = 50_000_000;

export const IMAGE_PROFILES = Object.freeze({
  dish: Object.freeze({
    original: Object.freeze({ width: 1_536, height: 1_536, quality: 84 }),
  }),
  activity: Object.freeze({
    original: Object.freeze({ width: 1_536, height: 1_536, quality: 84 }),
  }),
  wardrobe: Object.freeze({
    original: Object.freeze({ width: 1_080, height: 1_080, quality: 82 }),
  }),
  keyMoment: Object.freeze({
    original: Object.freeze({ width: 2_560, height: 2_560, quality: 92 }),
  }),
  mediaCover: Object.freeze({
    original: Object.freeze({ width: 1_080, height: 1_080, quality: 82 }),
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

  const quality = Math.max(1, Math.min(100, options.quality));
  return output
    .webp({
      quality,
      alphaQuality: Math.max(quality, 90),
      effort: 4,
      smartSubsample: true,
    })
    .toBuffer();
}

async function imageSource(buffer) {
  const source = sharp(buffer, {
    failOn: "error",
    limitInputPixels: MAX_IMAGE_PIXELS,
  }).rotate();
  try {
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
    return source;
  } catch (error) {
    if (/pixel limit/i.test(error?.message || "")) {
      const wrapped = new HttpError(
        413,
        "IMAGE_PIXELS_TOO_LARGE",
        "图片像素过高，请缩小图片后重试。",
      );
      wrapped.cause = error;
      throw wrapped;
    }
    throw error;
  }
}

export async function optimizeOriginalImage(buffer, profile = IMAGE_PROFILES.dish.original) {
  const source = await imageSource(buffer);

  return {
    original: await toWebp(source, profile),
    originalContentType: "image/webp",
  };
}

export function optimizedImagePaths(basePath) {
  return {
    imagePath: `${basePath}-${IMAGE_STORAGE_VERSION}.webp`,
  };
}

export function isOptimizedImagePath(path) {
  return typeof path === "string" && path.endsWith(`-${IMAGE_STORAGE_VERSION}.webp`);
}

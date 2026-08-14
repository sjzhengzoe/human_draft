import sharp from "sharp";
import { HttpError } from "./errors.mjs";

export const IMAGE_STORAGE_VERSION = "master-v1";
export const MAX_IMAGE_PIXELS = 50_000_000;
export const STANDARD_IMAGE_PROFILE = Object.freeze({
  width: 2_560,
  height: 2_560,
  quality: 88,
});

function toWebp(source, options) {
  let output = source;
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
  });
  try {
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) throw new Error("IMAGE_DIMENSIONS_UNAVAILABLE");
    return { source, metadata };
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

function cropRegion(metadata, crop) {
  if (!crop) return undefined;
  const width = metadata.autoOrient?.width || metadata.width;
  const height = metadata.autoOrient?.height || metadata.height;
  const left = Math.min(Math.floor(crop.x * width), width - 1);
  const top = Math.min(Math.floor(crop.y * height), height - 1);
  const right = Math.min(Math.max(Math.ceil((crop.x + crop.width) * width), left + 1), width);
  const bottom = Math.min(Math.max(Math.ceil((crop.y + crop.height) * height), top + 1), height);
  return { left, top, width: right - left, height: bottom - top };
}

export async function optimizeImage(buffer, crop) {
  const { source, metadata } = await imageSource(buffer);
  let output = source.autoOrient();
  const region = cropRegion(metadata, crop);
  if (region) output = output.extract(region);

  return {
    buffer: await toWebp(output, STANDARD_IMAGE_PROFILE),
    contentType: "image/webp",
  };
}

export function standardImagePath(basePath) {
  return `${basePath}-${IMAGE_STORAGE_VERSION}.webp`;
}

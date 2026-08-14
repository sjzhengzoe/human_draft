import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { config } from "../config.mjs";
import {
  IMAGE_PROFILES,
  MAX_IMAGE_PIXELS,
  isOptimizedImagePath,
  optimizedThumbnailPath,
  optimizeOriginalImage,
  optimizedImagePaths,
} from "../lib/image-processing.mjs";

async function createTestImage(width, height) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 210, g: 120, b: 70 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
}

test("incoming image uploads keep a five-megabyte server hard cap", () => {
  assert.ok(config.maxUploadSizeMb > 0);
  assert.ok(config.maxUploadSizeMb <= 5);
});

test("every image profile stores only one original", () => {
  for (const profile of Object.values(IMAGE_PROFILES)) {
    assert.ok(profile.original);
    assert.equal(profile.thumbnail, undefined);
  }
});

test("activity images keep one bounded lossy original", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.activity.original);
  const original = await sharp(result.original).metadata();

  assert.equal(result.originalContentType, "image/webp");
  assert.deepEqual(
    { format: original.format, width: original.width, height: original.height },
    { format: "webp", width: 1_536, height: 1_152 },
  );
  assert.deepEqual(Object.keys(result).sort(), ["original", "originalContentType"]);
  assert.equal(IMAGE_PROFILES.activity.original.quality, 84);
  assert.equal(IMAGE_PROFILES.activity.thumbnail, undefined);
});

test("WebP output uses lossy encoding rather than preserving every source pixel", async () => {
  const pixels = Buffer.alloc(240 * 180 * 3);
  for (let index = 0; index < pixels.length; index += 1) {
    pixels[index] = (index * 31 + Math.floor(index / 97)) % 251;
  }
  const input = await sharp(pixels, {
    raw: { width: 240, height: 180, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.dish.original);
  const outputPixels = await sharp(result.original).raw().toBuffer();
  assert.notDeepEqual(outputPixels, pixels);
});

test("dish optimization keeps one print-quality image without creating a thumbnail", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.dish.original);
  const metadata = await sharp(result.original).metadata();

  assert.deepEqual(Object.keys(result).sort(), ["original", "originalContentType"]);
  assert.equal(result.originalContentType, "image/webp");
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "webp", width: 1_536, height: 1_152 },
  );
  assert.equal(IMAGE_PROFILES.dish.thumbnail, undefined);
  assert.equal(IMAGE_PROFILES.dish.original.quality, 84);
});

test("image optimization never enlarges small images", async () => {
  const input = await createTestImage(300, 200);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.wardrobe.original);
  const original = await sharp(result.original).metadata();
  assert.deepEqual([original.width, original.height], [300, 200]);
});

test("wardrobe stores one bounded image", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.wardrobe.original);
  const original = await sharp(result.original).metadata();
  assert.deepEqual([original.width, original.height], [1_080, 810]);
  assert.equal(IMAGE_PROFILES.wardrobe.thumbnail, undefined);
});

test("media cover stores one bounded image", async () => {
  const input = await createTestImage(1_080, 1_440);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.mediaCover.original);
  const original = await sharp(result.original).metadata();
  assert.deepEqual([original.width, original.height], [810, 1_080]);
  assert.equal(IMAGE_PROFILES.mediaCover.thumbnail, undefined);
});

test("key moment photos keep one bounded lossy original", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.keyMoment.original);
  const original = await sharp(result.original).metadata();
  assert.deepEqual([original.width, original.height], [1_920, 1_440]);
  assert.equal(IMAGE_PROFILES.keyMoment.original.quality, 84);
  assert.equal(IMAGE_PROFILES.keyMoment.thumbnail, undefined);
});

test("image optimization preserves transparent pixels", async () => {
  const input = await sharp({
    create: {
      width: 200,
      height: 120,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const result = await optimizeOriginalImage(input, IMAGE_PROFILES.dish.original);
  const metadata = await sharp(result.original).metadata();
  assert.equal(metadata.hasAlpha, true);
});

test("images above the decoded pixel limit are rejected before processing", async () => {
  const oversizedSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="${
      Math.floor(MAX_IMAGE_PIXELS / 10_000) + 1
    }"><rect width="100%" height="100%" fill="red"/></svg>`,
  );
  await assert.rejects(
    optimizeOriginalImage(oversizedSvg, IMAGE_PROFILES.dish.original),
    (error) => error?.statusCode === 413 && error?.code === "IMAGE_PIXELS_TOO_LARGE",
  );
});

test("optimized storage paths are versioned and recognizable", () => {
  const paths = optimizedImagePaths("users/user/dishes/dish/revision");
  assert.equal(paths.imagePath, "users/user/dishes/dish/revision-cost-v4.webp");
  assert.equal(paths.thumbnailPath, undefined);
  assert.equal(isOptimizedImagePath(paths.imagePath), true);
  assert.equal(isOptimizedImagePath("users/user/dishes/dish/revision-normalized-v3.webp"), false);
  assert.equal(isOptimizedImagePath("users/user/dishes/dish/original.png"), false);
  assert.equal(
    optimizedThumbnailPath(paths.imagePath),
    "users/user/dishes/dish/revision-cost-v4-thumbnail.webp",
  );
  assert.equal(
    optimizedThumbnailPath("users/user/dishes/dish/revision-normalized-v3.webp"),
    "users/user/dishes/dish/revision-normalized-v3-thumbnail.webp",
  );
  assert.equal(optimizedThumbnailPath("users/user/dishes/dish/original.png"), "");
});

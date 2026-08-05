import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  IMAGE_COMPRESSION_PERCENT,
  IMAGE_PROFILES,
  isOptimizedImagePath,
  optimizeImage,
  optimizeOriginalImage,
  optimizedImagePaths,
} from "./lib/image-processing.mjs";

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

test("compression level zero keeps the original dimensions and uses lossless WebP", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeImage(input, IMAGE_PROFILES.dish);
  const [original, thumbnail] = await Promise.all([
    sharp(result.original).metadata(),
    sharp(result.thumbnail).metadata(),
  ]);

  assert.equal(result.originalContentType, "image/webp");
  assert.equal(result.thumbnailContentType, "image/webp");
  assert.equal(IMAGE_COMPRESSION_PERCENT, 0);
  assert.deepEqual(
    { format: original.format, width: original.width, height: original.height },
    { format: "webp", width: 3_200, height: 2_400 },
  );
  assert.deepEqual(
    { format: thumbnail.format, width: thumbnail.width, height: thumbnail.height },
    { format: "webp", width: 720, height: 540 },
  );
});

test("compression level zero preserves every decoded original pixel", async () => {
  const pixels = Buffer.alloc(24 * 16 * 3);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = index % 251;
  const input = await sharp(pixels, {
    raw: { width: 24, height: 16, channels: 3 },
  })
    .png()
    .toBuffer();
  const result = await optimizeImage(input, IMAGE_PROFILES.dish);
  const [sourcePixels, outputPixels] = await Promise.all([
    sharp(input).raw().toBuffer(),
    sharp(result.original).raw().toBuffer(),
  ]);
  assert.deepEqual(outputPixels, sourcePixels);
});

test("single-image optimization returns only the lossless original", async () => {
  const input = await createTestImage(1_536, 1_152);
  const result = await optimizeOriginalImage(input);
  const metadata = await sharp(result.original).metadata();

  assert.deepEqual(Object.keys(result).sort(), ["original", "originalContentType"]);
  assert.equal(result.originalContentType, "image/webp");
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "webp", width: 1_536, height: 1_152 },
  );
});

test("image optimization never enlarges small images", async () => {
  const input = await createTestImage(300, 200);
  const result = await optimizeImage(input, IMAGE_PROFILES.wardrobe);
  const [original, thumbnail] = await Promise.all([
    sharp(result.original).metadata(),
    sharp(result.thumbnail).metadata(),
  ]);
  assert.deepEqual([original.width, original.height], [300, 200]);
  assert.deepEqual([thumbnail.width, thumbnail.height], [300, 200]);
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
  const result = await optimizeImage(input, IMAGE_PROFILES.dish);
  const metadata = await sharp(result.original).metadata();
  assert.equal(metadata.hasAlpha, true);
});

test("optimized storage paths are versioned and recognizable", () => {
  const paths = optimizedImagePaths("users/user/dishes/dish/revision");
  assert.equal(paths.imagePath, "users/user/dishes/dish/revision-normalized-v3.webp");
  assert.equal(
    paths.thumbnailPath,
    "users/user/dishes/dish/revision-normalized-v3-thumbnail.webp",
  );
  assert.equal(isOptimizedImagePath(paths.imagePath), true);
  assert.equal(isOptimizedImagePath("users/user/dishes/dish/original.png"), false);
});

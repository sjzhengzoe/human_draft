import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { config } from "../config.mjs";
import {
  MAX_IMAGE_PIXELS,
  optimizeImage,
  STANDARD_IMAGE_PROFILE,
  standardImagePath,
} from "../lib/image-processing.mjs";
import { parseImageCrop } from "../http/multipart-image.mjs";

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

test("incoming image uploads keep a ten-megabyte server hard cap", () => {
  assert.ok(config.maxUploadSizeMb > 0);
  assert.ok(config.maxUploadSizeMb <= 10);
});

test("all business images share one high-definition storage profile", () => {
  assert.deepEqual(STANDARD_IMAGE_PROFILE, {
    width: 2_560,
    height: 2_560,
    quality: 88,
  });
});

test("image optimization produces one bounded WebP master", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeImage(input);
  const metadata = await sharp(result.buffer).metadata();

  assert.deepEqual(Object.keys(result).sort(), ["buffer", "contentType"]);
  assert.equal(result.contentType, "image/webp");
  assert.deepEqual(
    { format: metadata.format, width: metadata.width, height: metadata.height },
    { format: "webp", width: 2_560, height: 1_920 },
  );
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
  const result = await optimizeImage(input);
  const outputPixels = await sharp(result.buffer).raw().toBuffer();
  assert.notDeepEqual(outputPixels, pixels);
});

test("image optimization never enlarges small images", async () => {
  const input = await createTestImage(300, 200);
  const result = await optimizeImage(input);
  const metadata = await sharp(result.buffer).metadata();
  assert.deepEqual([metadata.width, metadata.height], [300, 200]);
});

test("normalized crop coordinates are applied before the shared resize", async () => {
  const input = await createTestImage(3_200, 2_400);
  const result = await optimizeImage(input, {
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  });
  const metadata = await sharp(result.buffer).metadata();
  assert.deepEqual([metadata.width, metadata.height], [1_600, 1_200]);
});

test("image orientation is normalized before crop coordinates are applied", async () => {
  const input = await sharp({
    create: {
      width: 400,
      height: 200,
      channels: 3,
      background: { r: 80, g: 140, b: 220 },
    },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const result = await optimizeImage(input, {
    x: 0,
    y: 0,
    width: 1,
    height: 0.5,
  });
  const metadata = await sharp(result.buffer).metadata();
  assert.deepEqual([metadata.width, metadata.height], [200, 200]);
  assert.equal(metadata.orientation, undefined);
  assert.equal(metadata.exif, undefined);
});

test("image crop metadata accepts only normalized rectangles", () => {
  assert.deepEqual(parseImageCrop('{"x":0.1,"y":0.2,"width":0.6,"height":0.5}'), {
    x: 0.1,
    y: 0.2,
    width: 0.6,
    height: 0.5,
  });
  assert.equal(parseImageCrop(""), undefined);
  assert.throws(
    () => parseImageCrop('{"x":0.8,"y":0,"width":0.3,"height":1}'),
    (error) => error?.statusCode === 400 && error?.code === "INVALID_IMAGE_CROP",
  );
  assert.throws(
    () => parseImageCrop('{"x":null,"y":0,"width":1,"height":1}'),
    (error) => error?.statusCode === 400 && error?.code === "INVALID_IMAGE_CROP",
  );
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
  const result = await optimizeImage(input);
  const metadata = await sharp(result.buffer).metadata();
  assert.equal(metadata.hasAlpha, true);
});

test("images above the decoded pixel limit are rejected before processing", async () => {
  const oversizedSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="10000" height="${
      Math.floor(MAX_IMAGE_PIXELS / 10_000) + 1
    }"><rect width="100%" height="100%" fill="red"/></svg>`,
  );
  await assert.rejects(
    optimizeImage(oversizedSvg),
    (error) => error?.statusCode === 413 && error?.code === "IMAGE_PIXELS_TOO_LARGE",
  );
});

test("new image storage paths identify the shared master policy", () => {
  assert.equal(
    standardImagePath("users/user/dishes/dish/revision"),
    "users/user/dishes/dish/revision-master-v1.webp",
  );
});

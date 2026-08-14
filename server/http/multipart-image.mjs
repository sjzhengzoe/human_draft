import { assertCondition } from "../lib/errors.mjs";

export const STANDARD_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function parseImageCrop(value) {
  if (value === undefined || value === null || value === "") return undefined;
  let crop;
  try {
    crop = typeof value === "string" ? JSON.parse(value) : value;
  } catch (_error) {
    assertCondition(false, 400, "INVALID_IMAGE_CROP", "图片裁剪范围无效。" );
  }
  assertCondition(
    crop && typeof crop === "object" && !Array.isArray(crop),
    400,
    "INVALID_IMAGE_CROP",
    "图片裁剪范围无效。",
  );
  const normalized = Object.fromEntries(
    ["x", "y", "width", "height"].map((key) => [key, crop[key]]),
  );
  assertCondition(
    Object.values(normalized).every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
    )
      && normalized.x >= 0
      && normalized.y >= 0
      && normalized.width > 0
      && normalized.height > 0
      && normalized.x + normalized.width <= 1.000001
      && normalized.y + normalized.height <= 1.000001,
    400,
    "INVALID_IMAGE_CROP",
    "图片裁剪范围无效。",
  );
  return normalized;
}

export async function readMultipartImage(request, options = {}) {
  const fieldName = options.fieldName || "image";
  const fields = {};
  let image;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== fieldName) {
        part.file.resume();
        continue;
      }
      assertCondition(!image, 400, "MULTIPLE_IMAGES", "一次只能上传一张图片。" );
      assertCondition(
        STANDARD_IMAGE_TYPES.has(part.mimetype),
        415,
        "UNSUPPORTED_IMAGE_TYPE",
        "仅支持 PNG、JPEG 或 WebP 图片。",
      );
      const chunks = [];
      for await (const chunk of part.file) chunks.push(chunk);
      assertCondition(!part.file.truncated, 413, "IMAGE_TOO_LARGE", "图片文件过大。" );
      image = {
        buffer: Buffer.concat(chunks),
        mimetype: part.mimetype,
        filename: part.filename,
      };
    } else {
      fields[part.fieldname] = String(part.value ?? "").trim();
    }
  }

  if (image) image.crop = parseImageCrop(fields.image_crop);
  delete fields.image_crop;

  return { fields, image };
}

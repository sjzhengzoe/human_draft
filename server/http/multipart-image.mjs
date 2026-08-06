import { assertCondition } from "../lib/errors.mjs";

export const STANDARD_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function readMultipartImage(request) {
  const fields = {};
  let image;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "image") {
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

  return { fields, image };
}

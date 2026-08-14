import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const businessImagePages = [
  "../../src/pages/activities/edit/index.ts",
  "../../src/pages/key-moments/edit/index.ts",
  "../../src/pages/menu/edit/index.ts",
  "../../src/pages/menu/place-edit/index.ts",
  "../../src/pages/media/detail/index.ts",
  "../../src/pages/media/edit/index.ts",
  "../../src/pages/settings/profile-edit/index.ts",
  "../../src/pages/wardrobe/item-edit/index.ts",
];

const businessImageDomains = [
  "../domains/activities/service.mjs",
  "../domains/auth/profile.mjs",
  "../domains/key-moments/service.mjs",
  "../domains/media/service.mjs",
  "../domains/menu/dish-images.mjs",
  "../domains/wardrobe/service.mjs",
];

test("every business image page uploads the selected original plus crop metadata", async () => {
  const sources = await Promise.all(
    businessImagePages.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.match(source, /sizeType:\s*\["original"\]/);
    assert.match(source, /sourceFilePath/);
    assert.match(source, /(?:selectedImageUploadPath|selectedEntryImageUploadPath|pendingAvatarUploadPath)/);
    assert.doesNotMatch(source, /outputSize|outputType|outputQuality|wx\.compressImage/);
  }
});

test("every business image domain uses the one shared server processor", async () => {
  const sources = await Promise.all(
    businessImageDomains.map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  for (const source of sources) {
    assert.match(source, /uploadStandardImage/);
    assert.match(source, /crop: image\.crop/);
    assert.doesNotMatch(source, /optimizeImage|STANDARD_IMAGE_PROFILE/);
  }
});

test("the repository declares one authoritative business image policy", async () => {
  const [request, processor, policy, readme] = await Promise.all([
    readFile(new URL("../../src/services/request.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/image-processing.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../docs/image-processing.md", import.meta.url), "utf8"),
    readFile(new URL("../../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(request, /formData\.image_crop = JSON\.stringify\(options\.imageCrop\)/);
  assert.match(processor, /STANDARD_IMAGE_PROFILE = Object\.freeze\(\{[\s\S]*?width: 2_560,[\s\S]*?height: 2_560,[\s\S]*?quality: 88/);
  assert.match(processor, /source\.autoOrient\(\)[\s\S]*?output\.extract\(region\)[\s\S]*?toWebp/);
  assert.match(policy, /唯一现行规范/);
  assert.match(policy, /模块不得决定输出像素、格式、质量/);
  assert.match(readme, /业务图片统一处理方案/);
});

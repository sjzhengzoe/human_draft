import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("menu edit keeps landscape dish images visible without square cropping", async () => {
  const [page, cropper] = await Promise.all([
    readFile(new URL("../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="image-field__preview"[\s\S]*?mode="aspectFit"/);
  assert.match(page, /shape="rectangle"/);
  assert.match(page, /aspect-ratio="1\.5"/);
  assert.match(page, /output-size="1440"/);
  assert.match(cropper, /viewportWidth/);
  assert.match(cropper, /viewportHeight/);
  assert.match(cropper, /canvas\.height = outputHeight/);
});

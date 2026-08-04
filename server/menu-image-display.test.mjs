import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("menu images use one 3:2 crop from upload through browsing", async () => {
  const [page, styles, menuPage, menuStyles, cropper] = await Promise.all([
    readFile(new URL("../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="image-field__preview"[\s\S]*?mode="aspectFit"/);
  assert.match(page, /shape="rectangle"/);
  assert.match(page, /aspect-ratio="1\.5"/);
  assert.match(page, /output-size="1536"/);
  assert.match(styles, /\.image-field[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(menuPage, /displayMode === 'quick'/);
  assert.match(menuPage, /displayMode === 'browse'/);
  assert.match(menuPage, /mode="aspectFit"/);
  assert.match(menuStyles, /\.dish-image-frame[^}]*padding-top:\s*66\.6667%/);
  assert.match(cropper, /viewportWidth/);
  assert.match(cropper, /viewportHeight/);
  assert.match(cropper, /canvas\.height = outputHeight/);
});

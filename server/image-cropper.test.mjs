import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared image cropper rotates the source and exports the rotated crop", async () => {
  const [logic, page, styles] = await Promise.all([
    readFile(new URL("../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.less", import.meta.url), "utf8"),
  ]);

  assert.match(page, /src="\{\{displaySrc\}\}"/);
  assert.match(page, /bindtap="handleRotate"[\s\S]*顺时针旋转 90°/);
  assert.match(logic, /async handleRotate\(\)/);
  assert.match(logic, /const outputWidth = state\.naturalHeight/);
  assert.match(logic, /const outputHeight = state\.naturalWidth/);
  assert.match(logic, /ctx\.translate\(outputWidth, 0\)/);
  assert.match(logic, /ctx\.rotate\(Math\.PI \/ 2\)/);
  assert.match(logic, /await this\.initializeCrop\(rotatedSrc\)/);
  assert.match(
    logic,
    /loadCanvasImage\([\s\S]*this\.data\.displaySrc \|\| this\.properties\.src/,
  );
  assert.match(styles, /\.crop-modal__rotate[^}]*width:\s*auto !important/);
  assert.match(styles, /\.crop-modal__rotate[^}]*padding:\s*0 22rpx !important/);
});

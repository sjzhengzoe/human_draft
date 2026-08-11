import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared image cropper uses a fullscreen adjustable frame with optional fixed ratios", async () => {
  const [logic, page, styles, config, dialogLogic, dialogPage, dialogStyles] = await Promise.all([
    readFile(new URL("../../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/image-cropper/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/image-cropper/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/image-cropper/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-dialog/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-dialog/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-dialog/index.less", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<app-dialog[\s\S]*?fullscreen="\{\{true\}\}"/);
  assert.match(page, /class="crop-editor__cancel"[\s\S]*?bindtap="handleCancel"[\s\S]*?>取消</);
  assert.match(page, /class="crop-workspace"/);
  assert.match(page, /class="crop-frame crop-frame--\{\{shape\}\}"/);
  assert.match(page, /data-handle="nw"[\s\S]*?handleResizeTouchStart/);
  assert.match(page, /wx:if="\{\{!fixedAspectRatio\}\}"[\s\S]*?data-handle="n"/);
  assert.match(page, /aria-label="裁剪工具，已启用"[\s\S]*?<app-icon name="crop-white"/);
  assert.match(page, /class="crop-toolbar__ratio-tool[\s\S]*?bindtap="handleRatioToolTap"/);
  assert.match(page, /wx:for="\{\{ratioOptions\}\}"[\s\S]*?bindtap="handleRatioOptionTap"/);
  assert.match(page, /class="crop-toolbar__done"[\s\S]*?bindtap="handleConfirm"[\s\S]*?>完成/);
  assert.doesNotMatch(page, /原图|data-mode|handleModeTap|handleRotate/);

  assert.match(logic, /aspectRatio:[\s\S]*?value: 0/);
  assert.match(logic, /function initialCropFrame/);
  assert.match(logic, /if \(!input\.fixedAspectRatio\)[\s\S]*?width: input\.imageWidth[\s\S]*?height: input\.imageHeight/);
  assert.match(logic, /function resizeFreeCropFrame/);
  assert.match(logic, /function resizeFixedCropFrame/);
  assert.match(logic, /shape === "circle" \|\| shape === "square"\) return 1/);
  assert.match(logic, /this\.properties\.aspectRatio/);
  assert.match(logic, /label: "1:1", value: 1/);
  assert.match(logic, /label: "4:3", value: 4 \/ 3/);
  assert.match(logic, /label: "16:9", value: 16 \/ 9/);
  assert.match(logic, /handleRatioOptionTap[\s\S]*?state\.fixedAspectRatio = ratio/);
  assert.match(logic, /const ratioLocked = fixedAspectRatio > 0/);
  assert.match(logic, /outputType:[\s\S]*?value: "png"/);
  assert.match(logic, /outputQuality:[\s\S]*?value: 0\.86/);
  assert.match(logic, /const outputScale = Math\.min\(maximumOutputWidth \/ sourceWidth, 1\)/);
  assert.doesNotMatch(logic, /if \(!cropped\)[\s\S]*?tempFilePath: this\.data\.displaySrc/);
  assert.match(logic, /wx\.hideLoading\(\)[\s\S]*?this\.triggerEvent\("error"/);
  assert.match(logic, /const sourceWidth = Math\.min\(state\.cropWidth \* imageScaleX/);

  assert.match(styles, /\.crop-editor\s*\{[^}]*height:\s*100%/);
  assert.match(styles, /\.crop-frame\s*\{[^}]*box-shadow:\s*0 0 0 2000rpx/);
  assert.match(styles, /\.crop-toolbar__done[^}]*background:\s*var\(--ui-color-success\)/);
  assert.match(styles, /\.crop-ratio-option--active[^}]*background:\s*var\(--ui-color-action-primary\)/);
  assert.match(config, /"app-icon": "\/components\/app-icon\/index"/);
  assert.match(dialogLogic, /fullscreen:/);
  assert.match(dialogPage, /app-dialog--fullscreen/);
  assert.match(dialogStyles, /\.app-dialog--fullscreen \.app-dialog__panel[^}]*height:\s*100%[^}]*max-height:\s*none/);
});

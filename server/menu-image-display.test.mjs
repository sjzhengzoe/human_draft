import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("menu uploads one 3:2 crop and renders square browsing frames", async () => {
  const [page, styles, menuPage, menuStyles, menuLogic, cropper] = await Promise.all([
    readFile(new URL("../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="image-field__preview"[\s\S]*?mode="aspectFit"/);
  assert.match(page, /shape="rectangle"/);
  assert.match(page, /aspect-ratio="1\.5"/);
  assert.match(page, /output-size="1536"/);
  assert.match(styles, /\.image-field[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(menuPage, /displayMode === 'quick'/);
  assert.match(menuPage, /displayMode === 'browse'/);
  assert.doesNotMatch(menuPage, /当前 \{\{dishes\.length\}\} 个选择/);
  assert.doesNotMatch(menuPage, /data-type="all"/);
  assert.doesNotMatch(menuPage, />全部<\/view>/);
  assert.doesNotMatch(menuPage, /quick-card__type/);
  assert.doesNotMatch(menuPage, /quick-card__meals/);
  assert.doesNotMatch(menuPage, /quick-card__category/);
  assert.match(menuPage, /class="browse-scroll"/);
  assert.match(menuPage, /bindscroll="handleBrowseScroll"/);
  assert.match(menuPage, /bindscrollend="handleBrowseScrollEnd"/);
  assert.match(menuPage, /scroll-with-animation/);
  assert.match(menuPage, /scroll-x/);
  assert.doesNotMatch(menuPage, /左右滑动/);
  assert.match(menuPage, /mode="aspectFit"/);
  assert.match(menuStyles, /\.dish-image-frame[^}]*padding-top:\s*100%/);
  assert.match(menuStyles, /\.quick-grid[^}]*grid-template-columns:\s*repeat\(3/);
  assert.match(menuStyles, /\.quick-card[^}]*border-radius:\s*34rpx/);
  assert.match(menuStyles, /\.quick-card[^}]*padding:\s*0/);
  assert.match(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*border-radius:\s*33rpx 33rpx 0 0/);
  assert.doesNotMatch(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*transform:\s*scale/);
  assert.match(menuStyles, /\.quick-card__name[^}]*text-align:\s*center/);
  assert.match(menuStyles, /\.browse-scroll[^}]*background:\s*var\(--ui-page-background\)/);
  assert.match(menuStyles, /\.record-filter__item--active[^}]*border-color:\s*#111/);
  assert.match(menuStyles, /\.category-chip--active[^}]*border-color:\s*#111/);
  assert.match(menuLogic, /resolveCategoryFilter/);
  assert.match(menuLogic, /activeFilter,\s*activeRecordType,/);
  assert.match(cropper, /viewportWidth/);
  assert.match(cropper, /viewportHeight/);
  assert.match(cropper, /canvas\.height = outputHeight/);
});

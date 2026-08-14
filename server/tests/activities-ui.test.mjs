import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

test("activity list uses top scene tabs and the same two-column image grid as menu quick view", async () => {
  const [template, styles, page, service] = await Promise.all([
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/services/activities.ts", projectRoot), "utf8"),
  ]);

  assert.match(template, /class="activity-type-switch"/);
  assert.match(template, /class="activity-list-scroll"[^>]*scroll-y/);
  assert.match(template, /class="activity-grid"/);
  assert.match(template, /class="activity-card"/);
  assert.match(template, /src="\{\{item\.image_url\}\}"/);
  assert.doesNotMatch(template, /thumbnail_/);
  assert.match(template, /item\.introduction/);
  assert.doesNotMatch(template, /<swiper|<swiper-item/);
  assert.doesNotMatch(template, /室内活动/);
  assert.doesNotMatch(template, /class="(?:counter|pagination|swipe-button)/);
  assert.doesNotMatch(template, /bindtap="handle(?:Previous|Next|Prev)/);
  assert.doesNotMatch(template, /contentLoading|正在加载活动…[\s\S]*content-loading/);
  assert.match(styles, /\.activity-grid\s*{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)[^}]*column-gap:\s*24rpx[^}]*row-gap:\s*34rpx/);
  assert.match(styles, /\.activity-card__image-frame\s*{[^}]*width:\s*100%[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.doesNotMatch(styles, /\.browse-(?:carousel|swiper|slide)/);
  assert.match(page, /itemsByType: emptyActivityItemsByType\(\)/);
  assert.match(page, /const items = this\.data\.itemsByType\[type\]/);
  assert.doesNotMatch(page, /browseCurrentIndex|browseIndices|handleBrowseChange/);
  const typeHandler = page.match(/handleTypeTap[\s\S]*?\n  },/)?.[0] || "";
  assert.doesNotMatch(typeHandler, /loadItems|listActivityItems/);
  assert.match(service, /all_types: activityType \? undefined : "true"/);
});

test("activity editor reuses shared dialogs and the 4:3 image cropper", async () => {
  const [template, styles, page, config] = await Promise.all([
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.json", projectRoot), "utf8"),
  ]);

  assert.match(template, /<app-dialog/);
  assert.match(template, /maxlength="12"/);
  assert.match(template, /aspect-ratio="1\.333333"/);
  assert.match(template, /title="裁剪为 4:3 活动封面"/);
  assert.match(template, /aria-label="新增活动"/);
  assert.match(template, /aria-label="管理\{\{activeType\}\}活动"/);
  assert.match(template, /wx:if="\{\{showEditor\}\}"\s+visible="\{\{true\}\}"/);
  assert.equal(template.match(/^\s+dialog-mode\s*$/gm)?.length, 2);
  assert.match(template, /aria-label="\{\{selectedImagePath \|\| currentImageUrl \? '更换活动封面' : '添加活动封面'\}\}"/);
  assert.match(template, /<text>添加封面<\/text>/);
  assert.match(template, /class="activity-editor__main"/);
  assert.match(styles, /\.activity-editor__image\s*{[^}]*width:\s*200rpx/);
  assert.doesNotMatch(template, /bindfocus=|bindblur=|scroll-into-view=/);
  assert.doesNotMatch(template, /track-keyboard=|adjust-position=|cursor-spacing=|^\s+persistent\s*$/m);
  assert.doesNotMatch(page, /handleEditorInputFocus|editorKeyboardSpacerHeight|editorFocusAnchor/);
  assert.doesNotMatch(template, /选择活动封面（选填）|例如：红花湖骑行|一句简介（选填）/);
  assert.doesNotMatch(template, /^\s+focus\s*$/m);
  assert.doesNotMatch(template, /wx\.showModal/);
  assert.match(config, /"image-cropper": "\/components\/image-cropper\/index"/);
});

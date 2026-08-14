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

test("activity editing and management use dedicated pages", async () => {
  const [template, page, editorTemplate, editorStyles, editorPage, editorConfig, managerTemplate, appConfig] = await Promise.all([
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/edit/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/edit/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/edit/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/edit/index.json", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/manage/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/app.json", projectRoot), "utf8"),
  ]);

  assert.doesNotMatch(template, /<app-dialog|<image-cropper|<app-input/);
  assert.match(template, /aria-label="新增活动"/);
  assert.match(template, /aria-label="管理\{\{activeType\}\}活动"/);
  assert.match(page, /pages\/activities\/edit\/index/);
  assert.match(page, /pages\/activities\/manage\/index/);
  assert.match(editorTemplate, /maxlength="12"/);
  assert.match(editorTemplate, /aspect-ratio="1\.333333"/);
  assert.match(editorTemplate, /title="裁剪为 4:3 活动封面"/);
  assert.match(editorTemplate, /custom-back="\{\{true\}\}"/);
  assert.match(editorTemplate, /aria-label="\{\{selectedImagePath \|\| currentImageUrl \? '更换活动封面' : '添加活动封面'\}\}"/);
  assert.match(editorStyles, /\.activity-image\s*{[^}]*aspect-ratio:\s*4 \/ 3/);
  assert.match(editorPage, /createActivityItem/);
  assert.match(editorPage, /replaceActivityItemImage/);
  assert.match(editorConfig, /"image-cropper": "\/components\/image-cropper\/index"/);
  assert.match(managerTemplate, /管理\{\{activeType\}\}活动/);
  assert.match(managerTemplate, /<app-dialog[\s\S]*?title="删除活动"/);
  assert.match(appConfig, /"pages\/activities"[\s\S]*?"edit\/index"[\s\S]*?"manage\/index"/);
});

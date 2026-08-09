import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

test("activity list uses top scene tabs and a button-free single-card swiper", async () => {
  const [template, styles, page, service] = await Promise.all([
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/services/activities.ts", projectRoot), "utf8"),
  ]);

  assert.match(template, /class="activity-type-switch"/);
  assert.match(template, /display-multiple-items="1"/);
  assert.match(template, /bindchange="handleBrowseChange"/);
  assert.match(template, /class="activity-card"/);
  assert.match(template, /item\.thumbnail_url \|\| item\.image_url/);
  assert.match(template, /item\.introduction/);
  assert.doesNotMatch(template, /室内活动/);
  assert.doesNotMatch(template, /class="(?:counter|pagination|swipe-button)/);
  assert.doesNotMatch(template, /bindtap="handle(?:Previous|Next|Prev)/);
  assert.doesNotMatch(template, /contentLoading|正在加载活动…[\s\S]*content-loading/);
  assert.match(styles, /\.activity-card\s*{[^}]*width:\s*calc\(100% - 32rpx\)/);
  assert.match(styles, /\.activity-card__image-frame\s*{[^}]*width:\s*100%[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.doesNotMatch(styles, /\.activity-card__image-frame\s*{[^}]*width:\s*480rpx/);
  assert.match(page, /itemsByType: emptyActivityItemsByType\(\)/);
  assert.match(page, /const items = this\.data\.itemsByType\[type\]/);
  const typeHandler = page.match(/handleTypeTap[\s\S]*?\n  },/)?.[0] || "";
  assert.doesNotMatch(typeHandler, /loadItems|listActivityItems/);
  assert.match(service, /all_types: activityType \? undefined : "true"/);
});

test("activity editor reuses shared dialogs and the 4:3 image cropper", async () => {
  const [template, config] = await Promise.all([
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/activities/index.json", projectRoot), "utf8"),
  ]);

  assert.match(template, /<app-dialog/);
  assert.match(template, /maxlength="200"/);
  assert.match(template, /aspect-ratio="1\.333333"/);
  assert.match(template, /title="裁剪为 4:3 活动封面"/);
  assert.match(template, /aria-label="新增活动"/);
  assert.match(template, /aria-label="管理\{\{activeType\}\}活动"/);
  assert.match(template, /wx:if="\{\{showEditor\}\}"\s+visible="\{\{true\}\}"/);
  assert.equal(template.match(/^\s+persistent\s*$/gm)?.length, 2);
  assert.doesNotMatch(template, /^\s+focus\s*$/m);
  assert.doesNotMatch(template, /wx\.showModal/);
  assert.match(config, /"image-cropper": "\/components\/image-cropper\/index"/);
});

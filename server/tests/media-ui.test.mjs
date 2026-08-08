import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../src/pages/media/index.wxml", import.meta.url);
const stylesUrl = new URL("../../src/pages/media/index.less", import.meta.url);
const logicUrl = new URL("../../src/pages/media/index.ts", import.meta.url);
const editPageUrl = new URL("../../src/pages/media/edit/index.wxml", import.meta.url);
const editLogicUrl = new URL("../../src/pages/media/edit/index.ts", import.meta.url);
const editConfigUrl = new URL("../../src/pages/media/edit/index.json", import.meta.url);

test("media overview and records share the same status-free four-column cards", async () => {
  const [page, styles, logic] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(logicUrl, "utf8"),
  ]);

  assert.match(page, />速览<\/view>/);
  assert.match(page, />记录<\/view>/);
  assert.equal(page.match(/class="record-grid/g)?.length, 2);
  assert.equal(page.match(/class="record-card"/g)?.length, 2);
  assert.doesNotMatch(page, /overview-list|overview-row/);
  assert.doesNotMatch(page, /swiper|status-badge|watch_status/);
  assert.doesNotMatch(page, /overviewCategoryOptions|handleOverviewCategoryChange/);
  assert.match(page, /bindtap="handleOverviewCategoryTap"/);
  assert.match(page, /bindtap="handleOverviewStatusTap"/);
  assert.match(logic, /applyOverviewFilters\(\)/);
  assert.match(styles, /\.record-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.doesNotMatch(page, /包含全部分类|包含全部记录/);
  assert.ok(page.indexOf('class="search-row"') < page.indexOf('class="media-toolbar"'));
  assert.ok(page.indexOf('class="category-list status-list"') < page.indexOf('class="media-toolbar"'));
});

test("media controls are vertically centered and use shared typography sizes", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const explicitSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)]
    .map((match) => Number(match[1]));

  assert.deepEqual([...new Set(explicitSizes)], [25]);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(
    styles,
    /\.record-card__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
  assert.match(styles, /\.record-grid\s*\{[^}]*align-items:\s*start;/s);
  assert.doesNotMatch(styles, /\.record-card__body\s*\{[^}]*min-height:/s);
  assert.match(styles, /\.view-switch__item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.search-row__button,[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/);
});

test("media cards hide empty episode counts and use category-specific placeholders", async () => {
  const [page, logic] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(logicUrl, "utf8"),
  ]);

  assert.doesNotMatch(page, /最近记录|recordDateText/);
  assert.match(page, /name="\{\{item\.placeholderIcon\}\}"/);
  assert.match(logic, /seasonCount > 0 \|\| episodeCount > 0/);
  for (const icon of ["book-open", "sparkles", "headphones", "tv", "clapperboard"]) {
    assert.match(logic, new RegExp(`"${icon}"`));
  }
});

test("media editing supports a shared 3:4 cover crop and upload", async () => {
  const [page, logic, config] = await Promise.all([
    readFile(editPageUrl, "utf8"),
    readFile(editLogicUrl, "utf8"),
    readFile(editConfigUrl, "utf8"),
  ]);

  assert.match(config, /"image-cropper":\s*"\/components\/image-cropper\/index"/);
  assert.match(page, /aspect-ratio="0\.75"/);
  assert.match(page, /output-size="1080"/);
  assert.match(page, /src="\{\{selectedImagePath \|\| coverUrl\}\}"/);
  assert.match(logic, /wx\.chooseMedia\(/);
  assert.match(logic, /replaceMediaEntryCover\(id, this\.data\.selectedImagePath\)/);
});

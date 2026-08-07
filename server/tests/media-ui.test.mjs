import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../src/pages/media/index.wxml", import.meta.url);
const stylesUrl = new URL("../../src/pages/media/index.less", import.meta.url);

test("media overview uses vertical sections and records use a status-free three-column grid", async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(page, />速览<\/view>/);
  assert.match(page, />记录<\/view>/);
  assert.match(page, /class="overview-list"/);
  assert.match(page, /class="record-grid"/);
  assert.doesNotMatch(page, /swiper|status-badge|watch_status/);
  assert.match(styles, /\.record-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
});

test("media controls are vertically centered and use shared typography sizes", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const explicitSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)]
    .map((match) => Number(match[1]));

  assert.deepEqual([...new Set(explicitSizes)], [25]);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(styles, /\.view-switch__item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.search-row__button,[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/);
});

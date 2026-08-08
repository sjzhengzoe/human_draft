import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nativeScrollPageConfigs = [
  "../../src/exercise/pages/index.json",
  "../../src/exercise/pages/rest-days/index.json",
  "../../src/exercise/pages/settings/index.json",
  "../../src/pages/luggage/scene-edit/index.json",
  "../../src/pages/media/categories/index.json",
  "../../src/pages/media/category-edit/index.json",
  "../../src/pages/media/edit/index.json",
  "../../src/pages/media/episode-edit/index.json",
  "../../src/pages/menu/day-plan/index.json",
  "../../src/pages/settings/index.json",
  "../../src/pages/wardrobe/categories/index.json",
  "../../src/pages/wardrobe/category-edit/index.json",
  "../../src/pages/wardrobe/item-edit/index.json",
];

test("document-flow pages keep native vertical scrolling enabled", async () => {
  for (const path of nativeScrollPageConfigs) {
    const config = JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
    assert.notEqual(config.disableScroll, true, `${path} must allow native page scrolling`);
  }
});

test("fixed media pages keep their own vertical scroll containers", async () => {
  const [configSource, page] = await Promise.all([
    readFile(new URL("../../src/pages/media/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(configSource).disableScroll, true);
  assert.match(page, /<scroll-view class="content-scroll" scroll-y/);
});

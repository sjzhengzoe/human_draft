import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const nativeScrollPageConfigs = [
  "../../src/exercise/pages/index.json",
  "../../src/exercise/pages/settings/index.json",
  "../../src/pages/media/categories/index.json",
  "../../src/pages/media/edit/index.json",
  "../../src/pages/media/episode-edit/index.json",
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

test("tab pages use bounded vertical scroll containers without empty bounce", async () => {
  const pages = [
    ["../../src/pages/create/index.json", "../../src/pages/create/index.wxml"],
    ["../../src/pages/settings/index.json", "../../src/pages/settings/index.wxml"],
  ];

  for (const [configPath, markupPath] of pages) {
    const [configSource, markup] = await Promise.all([
      readFile(new URL(configPath, import.meta.url), "utf8"),
      readFile(new URL(markupPath, import.meta.url), "utf8"),
    ]);
    assert.equal(JSON.parse(configSource).disableScroll, true);
    assert.match(markup, /<scroll-view[\s\S]*?scroll-y[\s\S]*?bounces="\{\{false\}\}"/);
  }
});

test("fixed media pages keep their own vertical scroll containers", async () => {
  const [configSource, page, detailConfigSource, detailPage, managerConfigSource, managerPage] = await Promise.all([
    readFile(new URL("../../src/pages/media/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/detail/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/detail/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/season-manage/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/season-manage/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(configSource).disableScroll, true);
  assert.match(page, /<scroll-view[\s\S]*?class="content-scroll"[\s\S]*?scroll-y/);
  assert.equal(JSON.parse(detailConfigSource).disableScroll, true);
  assert.match(detailPage, /<scroll-view[\s\S]*?class="detail-attribute-scroll"[\s\S]*?scroll-y/);
  assert.doesNotMatch(detailPage, /class="records-content|>剧情记录<|detail-tabs/);
  assert.equal(JSON.parse(managerConfigSource).disableScroll, true);
  assert.match(managerPage, /<scroll-view[\s\S]*?class="season-manager-scroll"[\s\S]*?scroll-y/);
});

async function listWxmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
    if (entry.isDirectory()) return listWxmlFiles(path);
    return entry.name.endsWith(".wxml") ? [path] : [];
  }));
  return files.flat();
}

test("vertical scroll views disable empty-content bounce", async () => {
  const files = await listWxmlFiles(new URL("../../src/", import.meta.url));

  for (const file of files) {
    const markup = await readFile(file, "utf8");
    const verticalScrollViews = markup.match(/<scroll-view\b[^>]*\bscroll-y(?:\s*=\s*"[^"]*")?[^>]*>/g) || [];
    for (const scrollView of verticalScrollViews) {
      assert.match(
        scrollView,
        /\bbounces="\{\{false\}\}"/,
        `${file.pathname} must disable vertical bounce`,
      );
    }
  }
});

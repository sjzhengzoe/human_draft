import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("media pages reuse loaded data until a successful mutation invalidates it", async () => {
  const [index, categories, detail, revision] = await Promise.all([
    readProjectFile("src/pages/media/index.ts"),
    readProjectFile("src/pages/media/categories/index.ts"),
    readProjectFile("src/pages/media/detail/index.ts"),
    readProjectFile("src/utils/media-data-revision.ts"),
  ]);

  assert.match(index, /sharedLoaded:\s*false/);
  assert.match(index, /overviewLoaded:\s*false/);
  assert.match(index, /recordLoaded:\s*false/);
  assert.match(index, /if \(!viewLoaded\) void this\.loadCurrentView\(\)/);
  assert.match(index, /this\.data\.mediaRevision !== mediaRevision/);
  assert.match(categories, /this\.data\.mediaRevision !== getMediaDataRevision\(\)/);
  assert.match(detail, /this\.data\.mediaRevision !== getMediaDataRevision\(\)/);
  assert.match(revision, /mediaDataRevision \+= 1/);
});

test("every media mutation page marks cached lists as changed", async () => {
  const mutationPages = [
    "src/pages/media/edit/index.ts",
    "src/pages/media/category-edit/index.ts",
    "src/pages/media/categories/index.ts",
    "src/pages/media/detail/index.ts",
    "src/pages/media/episode-edit/index.ts",
  ];
  const sources = await Promise.all(mutationPages.map(readProjectFile));

  for (const source of sources) {
    assert.match(source, /markMediaDataChanged/);
  }
});

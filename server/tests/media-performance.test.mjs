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
  assert.match(index, /if \(!this\.isCurrentCacheFresh\(\)\)/);
  assert.match(index, /handleContentLower\(\)/);
  assert.match(index, /handlePullRefresh\(\)/);
  assert.match(index, /this\.data\.mediaRevision !== mediaRevision/);
  assert.match(index, /syncLoadedDataFromCache\(mediaRevision\)/);
  assert.match(categories, /this\.data\.mediaRevision !== getMediaDataRevision\(\)/);
  assert.match(detail, /this\.data\.mediaRevision !== getMediaDataRevision\(\)/);
  assert.match(revision, /mediaDataRevision \+= 1/);
});

test("media reads reuse session cache and successful writes update it", async () => {
  const [service, cache, detail, index, auth] = await Promise.all([
    readProjectFile("src/services/media.ts"),
    readProjectFile("src/utils/media-data-cache.ts"),
    readProjectFile("src/pages/media/detail/index.ts"),
    readProjectFile("src/pages/media/index.ts"),
    readProjectFile("src/services/auth.ts"),
  ]);

  assert.match(service, /!isMediaEntryCacheFresh\(id\) \? null : getCachedMediaEntry\(id\)/);
  assert.match(service, /!isMediaSeasonsCacheFresh\(mediaEntryId\)/);
  assert.match(service, /cacheMediaEntry\(data\.item\)/);
  assert.match(service, /updateCachedMediaEpisode\(data\.item\)/);
  assert.match(service, /invalidateCachedMediaSeasons\(mediaEntryId\)/);
  assert.match(cache, /const cachedEntryPages = new Map/);
  assert.match(cache, /export function cacheMediaEntryPage/);
  assert.match(cache, /data\.items\.forEach\(storeEntryValue\)/);
  assert.match(cache, /page\.input\.sort === "rating_desc"/);
  assert.match(cache, /MAX_CACHED_MEDIA_DETAILS = 20/);
  assert.match(detail, /getCachedMediaEntry\(this\.data\.id\)/);
  assert.match(detail, /this\.applyPageData\(cachedEntry, cachedSeasons, cachedCategories/);
  assert.match(index, /getCachedMediaEntryPage/);
  assert.match(index, /hydrateCurrentViewFromCache/);
  assert.match(auth, /clearMediaDataCache\(\)/);
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

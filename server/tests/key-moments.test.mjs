import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { periodBounds } from "../domains/key-moments/service.mjs";

test("key moment period bounds use Asia/Shanghai calendar boundaries", () => {
  assert.deepEqual(periodBounds({ granularity: "day", date: "2026-08-02" }), {
    start: "2026-08-01T16:00:00.000Z",
    end: "2026-08-02T16:00:00.000Z",
  });
  assert.deepEqual(periodBounds({ granularity: "month", date: "2026-12-20" }), {
    start: "2026-11-30T16:00:00.000Z",
    end: "2026-12-31T16:00:00.000Z",
  });
  assert.deepEqual(periodBounds({ granularity: "year", date: "2026-02-01" }), {
    start: "2025-12-31T16:00:00.000Z",
    end: "2026-12-31T16:00:00.000Z",
  });
});

test("key moment period bounds reject invalid dates", () => {
  assert.throws(
    () => periodBounds({ granularity: "day", date: "2026-02-30" }),
    (error) => error?.code === "INVALID_DATE",
  );
  assert.throws(
    () => periodBounds({ granularity: "week", date: "2026-08-02" }),
    (error) => error?.code === "INVALID_GRANULARITY",
  );
});

test("key moment creation uses the previewed date only for day view", async () => {
  const page = await readFile(
    new URL("../../src/pages/key-moments/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /const editorDate = this\.data\.activeGranularity === "day"[\s\S]*?\? this\.data\.anchorDate[\s\S]*?: now\.date/,
  );
  assert.match(page, /editorDate,[\s\S]*?editorTime: now\.time/);
});

test("key moment items own the edit hit area and isolate the corner delete control", async () => {
  const [page, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(
    page,
    /class="timeline-entry[^\n]*"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?bindtap="handleEdit"/,
  );
  assert.match(page, /class="moment-image"[\s\S]*?catchtap="handlePreview"/);
  assert.match(
    page,
    /class="timeline-delete-button"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?catchtap="handleDelete"/,
  );
  assert.doesNotMatch(page, /class="delete-button"|edit-button|edit-button__dots|•••/);
  assert.match(styles, /\.timeline-delete-button/);
  assert.doesNotMatch(styles, /\.delete-button|\.edit-button/);
  assert.match(
    logic,
    /handleDelete\(event:[\s\S]*?editingId: id,[\s\S]*?showDeleteConfirm: true/,
  );
  assert.match(
    logic,
    /handleDeleteConfirmCancel\(\)[\s\S]*?showDeleteConfirm: false, editingId: ""/,
  );
});

test("tapping the key moment page title scrolls the timeline back to the top", async () => {
  const [page, logic, navigationPage, navigationLogic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/custom-navigation/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/custom-navigation/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /title-tappable="\{\{true\}\}"[\s\S]*?bind:titletap="handleScrollToTop"/);
  assert.match(page, /scroll-with-animation="\{\{true\}\}"[\s\S]*?scroll-into-view="\{\{timelineScrollAnchor\}\}"/);
  assert.match(page, /id="timeline-scroll-top"/);
  assert.match(logic, /handleScrollToTop\(\)[\s\S]*?timelineScrollAnchor: ""[\s\S]*?timelineScrollAnchor: "timeline-scroll-top"/);
  assert.match(navigationPage, /class="custom-navigation__content \{\{titleTappable[\s\S]*?bindtap="handleTitleTap"/);
  assert.match(navigationPage, /class="custom-navigation__back"[\s\S]*?catchtap="handleBack"/);
  assert.doesNotMatch(navigationPage, /class="custom-navigation__back"[\s\S]*?bindtap="handleBack"/);
  assert.match(navigationLogic, /handleTitleTap\(\)[\s\S]*?triggerEvent\("titletap"\)/);
});

test("key moment images keep their source ratio and make the shared crop step optional", async () => {
  const [page, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="moment-image"[\s\S]*?mode="widthFix"/);
  assert.match(page, /class="image-editor__preview"[\s\S]*?mode="aspectFit"[\s\S]*?bindtap="handleChooseImage"/);
  assert.match(page, /<image-cropper[\s\S]*?shape="rectangle"[\s\S]*?title="调整节点图片"/);
  assert.match(page, /<image-cropper[\s\S]*?output-size="1440"[\s\S]*?output-type="jpg"[\s\S]*?output-quality="0\.88"/);
  assert.doesNotMatch(page, /<image-cropper[\s\S]*?aspect-ratio=/);
  assert.doesNotMatch(page, /image-editor__action|可直接使用|>裁剪<|bind:original|free-ratio|allow-original/);
  assert.doesNotMatch(styles, /\.moment-image\s*\{[\s\S]*?aspect-ratio: 4 \/ 3;/);
  assert.match(
    logic,
    /showImageCropper: true,[\s\S]*?cropSourcePath: file\.tempFilePath/,
  );
  assert.match(logic, /handleImageCropConfirm\([\s\S]*?selectedImagePath: tempFilePath/);
  assert.doesNotMatch(logic, /handleOpenImageCropper|handleImageOriginal/);
});

test("key moments offer user-scoped horizontal and vertical display settings", async () => {
  const [page, styles, logic, settingsPage, settingsLogic, storage, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/settings/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/key-moment-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /class="settings-button"[\s\S]*?aria-label="人生节点设置"[\s\S]*?<app-icon name="settings-2"/,
  );
  assert.doesNotMatch(page, /<text>设置<\/text>/);
  assert.match(
    page,
    /class="add-button"[\s\S]*?aria-label="新增人生节点"[\s\S]*?<app-icon name="plus-white"/,
  );
  assert.match(page, /moment-card--\{\{displayLayout\}\}/);
  assert.match(styles, /\.moment-card--vertical\s*\{[\s\S]*?display: block;/);
  assert.match(styles, /\.moment-card--vertical \.moment-image\s*\{[\s\S]*?width: 100%;/);
  assert.match(logic, /getKeyMomentDisplayLayout\(session\.user\.id\)/);
  assert.match(logic, /wx\.navigateTo\(\{ url: "\/pages\/key-moments\/settings\/index" \}\)/);
  assert.match(settingsPage, /默认图文布局/);
  assert.match(settingsPage, /layout-preview--\{\{item\.value\}\}/);
  assert.match(settingsLogic, /setKeyMomentDisplayLayout\(this\.data\.userId, layout\)/);
  assert.match(storage, /KEY_MOMENT_DISPLAY_LAYOUT_V1/);
  assert.match(storage, /storageKey\(userId\)/);
  const parsedAppConfig = JSON.parse(appConfig);
  const registeredPages = [
    ...parsedAppConfig.pages,
    ...parsedAppConfig.subPackages.flatMap((subPackage) =>
      subPackage.pages.map((registeredPage) => `${subPackage.root}/${registeredPage}`),
    ),
  ];
  assert.ok(registeredPages.includes("pages/key-moments/settings/index"));
});

test("key moments reuse cached periods and update cached lists after writes", async () => {
  const [page, service, cache, auth] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/key-moments.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/key-moment-data-cache.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/auth.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /if \(!this\.data\.hasLoaded\) \{[\s\S]*?this\.loadItems\(\)/);
  assert.match(page, /this\.data\.keyMomentRevision !== getKeyMomentDataRevision\(\)/);
  assert.match(page, /if \(!cached\?\.fresh\) void this\.loadItems\(\{ background: true, silent: true \}\)/);
  assert.match(page, /syncItemsFromCache/);
  assert.doesNotMatch(page, /wx\.showToast\(\{ title: "已保存"[\s\S]{0,80}?await this\.loadItems\(\)/);
  assert.doesNotMatch(page, /wx\.showToast\(\{ title: "已删除"[\s\S]{0,80}?await this\.loadItems\(\)/);
  assert.match(page, /finally \{[\s\S]*?wx\.hideLoading\(\)[\s\S]*?if \(toastTitle[\s\S]*?wx\.showToast/);
  assert.match(service, /if \(cached\?\.fresh\) return cached\.items/);
  assert.match(service, /pendingKeyMomentRequests/);
  assert.match(service, /updateCachedKeyMoment\(data\.item\)/);
  assert.match(service, /removeCachedKeyMoment\(id\)/);
  assert.match(cache, /KEY_MOMENT_CACHE_FRESH_MS = 5 \* 60 \* 60 \* 1000/);
  assert.match(cache, /MAX_CACHED_KEY_MOMENT_QUERIES = 24/);
  assert.match(auth, /clearKeyMomentDataCache\(\)/);
});

test("key moment image loading and uploads avoid unnecessary serial work", async () => {
  const [page, routes, storage, imageProcessing] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../routes/key-moments.mjs", import.meta.url), "utf8"),
    readFile(new URL("../domains/shared/image-storage.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/image-processing.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /thumbnail_url \|\| item\.image_url[\s\S]*?lazy-load/);
  assert.match(routes, /await Promise\.all\(\[[\s\S]*?checkText[\s\S]*?checkImage/);
  assert.match(storage, /const \[imageResult, thumbnailResult\] = await Promise\.all/);
  assert.match(imageProcessing, /keyMoment:[\s\S]*?width: 1_920[\s\S]*?width: 1_080/);
});

test("key moments migration creates user-owned records and a private image bucket", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608020001_key_moments.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /alter table public\.key_moments enable row level security/i);
  assert.match(migration, /'key-moment-images',[\s\S]*?false,/i);
  assert.match(migration, /key_moments_user_occurred_idx/i);
});

test("key moment content limit migration preserves old rows and enforces 50 characters", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608020002_key_moment_content_limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /char_length\(content\) <= 50/i);
  assert.match(migration, /not valid/i);
});

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
  const [page, editor] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(
    page,
    /const editorDate = this\.data\.activeGranularity === "day"[\s\S]*?\? this\.data\.anchorDate[\s\S]*?: now\.date/,
  );
  assert.match(page, /pages\/key-moments\/edit\/index\?date=\$\{editorDate\}&time=\$\{now\.time\}/);
  assert.match(editor, /editorDate: INITIAL_DATE_TIME\.date/);
  assert.match(editor, /editorTime: INITIAL_DATE_TIME\.time/);
});

test("key moment items open the same detail flow and deletion lives only in detail", async () => {
  const [page, styles, logic, detailPage, detailStyles, detailLogic, detailConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.json", import.meta.url), "utf8"),
  ]);
  assert.match(
    page,
    /class="timeline-entry[^\n]*"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?bindtap="handleMomentTap"/,
  );
  assert.match(page, /class="moment-image[^\n]*"[\s\S]*?catchtap="handlePreview"/);
  assert.doesNotMatch(page, /timeline-delete-button|删除关键节点|handleDelete/);
  assert.doesNotMatch(styles, /timeline-delete-button/);
  assert.doesNotMatch(logic, /deleteKeyMoment|handleDelete|showDeleteConfirm|deleting/);
  assert.match(detailPage, /class="detail-actions"[\s\S]*?class="detail-edit"[\s\S]*?class="detail-delete"/);
  assert.match(detailPage, /aria-label="删除当前人生节点"[\s\S]*?bindtap="handleDelete"/);
  assert.match(detailPage, /<app-dialog[\s\S]*?title="删除关键节点"[\s\S]*?bindconfirm="handleDeleteConfirm"/);
  assert.match(detailStyles, /\.detail-actions[\s\S]*?display: flex/);
  assert.match(detailLogic, /handleDelete\(\)[\s\S]*?showDeleteConfirm: true/);
  assert.match(detailLogic, /handleDeleteConfirm\(\)[\s\S]*?deleteKeyMoment\(item\.id\)[\s\S]*?wx\.navigateBack\(\)/);
  assert.equal(JSON.parse(detailConfig).usingComponents["app-dialog"], "/components/app-dialog/index");
  assert.match(
    logic,
    /handleMomentTap\([\s\S]*?pages\/key-moments\/detail\/index\?id=/,
  );
  assert.doesNotMatch(logic, /handleMomentTap\([\s\S]*?activeGranularity === "day"/);
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

test("key moment editor selects up to nine original images and displays a WeChat-style grid", async () => {
  const [page, styles, editorPage, editorStyles, editorLogic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="moment-gallery moment-gallery--count-\{\{item\.image_count\}\}"/);
  assert.match(page, /class="moment-content"[\s\S]*?class="moment-gallery/);
  assert.match(page, /wx:for="\{\{item\.image_urls\}\}"[\s\S]*?mode="aspectFill"/);
  assert.match(editorPage, /wx:for="\{\{editorImages\}\}"[\s\S]*?class="image-grid__preview"[\s\S]*?mode="aspectFill"/);
  assert.ok(editorPage.indexOf('class="content-editor') < editorPage.indexOf('class="image-grid'));
  assert.ok(editorPage.indexOf('class="image-grid') < editorPage.indexOf('class="readonly-time'));
  assert.doesNotMatch(editorPage, /<image-cropper/);
  assert.match(styles, /\.moment-gallery[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /\.moment-image[\s\S]*?width: 100%;[\s\S]*?height: 166rpx/);
  assert.match(editorStyles, /\.image-grid[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(editorStyles, /\.image-grid__item,[\s\S]*?\.image-grid__add[\s\S]*?width: 100%;[\s\S]*?height: 222rpx/);
  assert.match(
    editorLogic,
    /const remaining = MAX_IMAGE_COUNT - this\.data\.editorImages\.length[\s\S]*?count: remaining/,
  );
  assert.match(editorLogic, /MAX_IMAGE_COUNT = 9/);
  assert.match(editorLogic, /sizeType: \["original"\]/);
});

test("key moment editor uses direct borderless text input and a read-only time", async () => {
  const [editorPage, editorConfig, editorLogic, service] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/key-moments.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(editorConfig).usingComponents, undefined);
  assert.match(
    editorPage,
    /<textarea[\s\S]*?class="content-editor"[\s\S]*?bindinput="handleEditorContentInput"/,
  );
  assert.match(editorPage, /class="readonly-time">\{\{editorDateTimeLabel\}\}<\/view>/);
  assert.doesNotMatch(editorPage, /节点文字|节点图片|<picker|<app-dialog/);
  assert.match(editorLogic, /handleEditorContentInput\([\s\S]*?editorContent: event\.detail\.value/);
  assert.doesNotMatch(editorLogic, /handleEditorDateChange|handleEditorTimeChange|contentEditorVisible/);
  assert.match(editorLogic, /updateKeyMoment\(this\.data\.editingId, \{ content \}\)/);
  assert.match(service, /export async function updateKeyMoment\([\s\S]*?input: \{ content: string \}[\s\S]*?data: \{ content: input\.content \}/);
});

test("key moments use one WeChat-style layout and remove obsolete layout settings", async () => {
  const [page, styles, logic, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /settings-button|handleSettings|displayLayout/);
  assert.match(page, /activeGranularity === 'year'[\s\S]*?class="today-publisher"/);
  assert.match(page, /class="today-publisher__label">今天<\/view>/);
  assert.match(page, /class="timeline-year-heading">\{\{item\.heading_year\}\}<\/view>/);
  assert.match(page, /class="timeline-date"[\s\S]*?timeline-date__month[\s\S]*?timeline-date__day[\s\S]*?timeline-date__time/);
  assert.match(page, /class="moment-content"[\s\S]*?class="moment-gallery/);
  assert.match(page, /item\.show_item_divider[\s\S]*?class="item-divider"/);
  assert.doesNotMatch(page, /interval_after|timeline-gap/);
  assert.match(
    page,
    /class="add-button"[\s\S]*?aria-label="新增人生节点"[\s\S]*?<app-icon name="plus-white"/,
  );
  assert.match(page, /class="moment-card \{\{item\.image_count === 0 \? 'moment-card--text-only' : ''\}\}"/);
  assert.match(styles, /\.moment-card\s*\{[\s\S]*?display: block;/);
  assert.match(styles, /\.moment-card--text-only[\s\S]*?min-height: 142rpx[\s\S]*?padding-bottom: 40rpx/);
  assert.match(styles, /\.timeline-entry[\s\S]*?grid-template-columns: 116rpx minmax\(0, 1fr\)/);
  assert.match(styles, /\.moment-image\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 166rpx/);
  assert.doesNotMatch(styles, /moment-card--vertical|moment-card--horizontal/);
  assert.doesNotMatch(logic, /getKeyMomentDisplayLayout|handleSettings|displayLayout/);
  assert.match(logic, /activeGranularity: "year" as KeyMomentGranularity/);
  assert.match(logic, /periodLabel: periodLabel\("year", INITIAL_DATE_TIME\.date\)/);
  assert.match(logic, /show_item_divider: index < items\.length - 1/);
  assert.match(logic, /heading_time: `\$\{pad\(parts\.hour\)\}:\$\{pad\(parts\.minute\)\}`/);
  assert.doesNotMatch(logic, /show_date_heading|show_date_divider|isSameShanghaiDate/);
  assert.doesNotMatch(logic, /intervalLabel|interval_after/);
  const parsedAppConfig = JSON.parse(appConfig);
  const registeredPages = [
    ...parsedAppConfig.pages,
    ...parsedAppConfig.subPackages.flatMap((subPackage) =>
      subPackage.pages.map((registeredPage) => `${subPackage.root}/${registeredPage}`),
    ),
  ];
  assert.ok(!registeredPages.includes("pages/key-moments/settings/index"));
  assert.ok(registeredPages.includes("pages/key-moments/edit/index"));
});

test("key moments reuse cached periods and update cached lists after writes", async () => {
  const [page, detail, service, cache, auth] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.ts", import.meta.url), "utf8"),
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
  assert.match(detail, /finally \{[\s\S]*?wx\.hideLoading\(\)[\s\S]*?if \(deleted[\s\S]*?wx\.showToast/);
  assert.match(service, /if \(cached\?\.fresh\) return cached\.items/);
  assert.match(service, /pendingKeyMomentRequests/);
  assert.match(service, /updateCachedKeyMoment\(data\.item\)/);
  assert.match(service, /removeCachedKeyMoment\(id\)/);
  assert.match(cache, /KEY_MOMENT_CACHE_FRESH_MS = 5 \* 60 \* 60 \* 1000/);
  assert.match(cache, /MAX_CACHED_KEY_MOMENT_QUERIES = 24/);
  assert.match(auth, /clearKeyMomentDataCache\(\)/);
});

test("key moment image loading uses ordered image arrays and shared storage processing", async () => {
  const [page, routes, storage, imageProcessing] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../routes/key-moments.mjs", import.meta.url), "utf8"),
    readFile(new URL("../domains/shared/image-storage.mjs", import.meta.url), "utf8"),
    readFile(new URL("../lib/image-processing.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(page, /wx:for="\{\{item\.image_urls\}\}"[\s\S]*?src="\{\{imageUrl\}\}"[\s\S]*?lazy-load/);
  assert.doesNotMatch(page, /thumbnail_/);
  assert.match(routes, /await Promise\.all\(\[[\s\S]*?checkText[\s\S]*?checkImage/);
  assert.match(storage, /uploadStandardImage/);
  assert.doesNotMatch(storage, /thumbnailResult|THUMBNAIL_UPLOAD_FAILED/);
  assert.match(imageProcessing, /STANDARD_IMAGE_PROFILE[\s\S]*?width: 2_560[\s\S]*?quality: 88/);
  assert.doesNotMatch(imageProcessing, /thumbnail:/);
});

test("key moment detail uses top-aligned adaptive single images and square multi-image grids", async () => {
  const [page, styles, logic, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/detail/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<swiper[\s\S]*?vertical="\{\{true\}\}"[\s\S]*?bindchange="handleSwiperChange"/);
  assert.match(page, /class="detail-content"[\s\S]*?class="detail-gallery/);
  assert.match(page, /wx:for="\{\{item\.image_urls\}\}"/);
  assert.match(page, /detail-image--single[\s\S]*?detail-image--grid/);
  assert.match(page, /bindload="handleSingleImageLoad"/);
  assert.match(page, /\{\{item\.date_label\}\} \{\{item\.time_label\}\}/);
  assert.match(styles, /\.detail-slide[\s\S]*?justify-content: flex-start/);
  assert.match(styles, /\.detail-gallery[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /\.detail-image--grid[\s\S]*?width: 100%;[\s\S]*?height: 195rpx/);
  assert.match(logic, /listKeyMomentFeed\(this\.data\.anchorDate\)/);
  assert.match(logic, /handleSingleImageLoad\([\s\S]*?sourceRatio[\s\S]*?single_image_style/);
  assert.match(logic, /wx\.previewImage\(\{ current, urls: item\.image_urls \}\)/);
  const keyMomentPackage = JSON.parse(appConfig).subPackages.find((entry) => entry.root === "pages/key-moments");
  assert.ok(keyMomentPackage.pages.includes("detail/index"));
});

test("key moment gallery migration preserves the former image and enforces nine images", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260815042027_key_moment_image_gallery.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set image_paths = array\[image_path\]/i);
  assert.match(migration, /cardinality\(image_paths\) between 0 and 9/i);
  assert.match(migration, /drop column if exists image_path/i);
  assert.match(migration, /char_length\(btrim\(content\)\) > 0[\s\S]*?cardinality\(image_paths\) > 0/i);
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

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
  assert.match(detailPage, /<app-dialog[\s\S]*?title="删除人生节点"[\s\S]*?bindconfirm="handleDeleteConfirm"/);
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
  assert.match(page, /class="moment-content"[\s\S]*?moment-content__text--clamped[\s\S]*?class="moment-gallery/);
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
  assert.match(editorLogic, /MAX_IMAGE_UPLOAD_BYTES = 10 \* 1024 \* 1024/);
  assert.match(editorLogic, /sizeType: \["original"\]/);
  assert.match(editorLogic, /localEditorImage\(file\.tempFilePath, Number\(file\.size\) \|\| 0\)/);
  assert.match(
    editorLogic,
    /第 \$\{positions\.join\("、"\)\} 张照片超过 10 MB，请压缩或删除/,
  );
  assert.match(
    editorLogic,
    /async saveEditor\(\)[\s\S]*?oversizedImagePositions\(this\.data\.editorImages\)[\s\S]*?showOversizedImageWarning\(oversizedPositions\)[\s\S]*?return/,
  );
});

test("key moment editor saves the complete ordered gallery instead of incremental mutations", async () => {
  const [editorPage, editorStyles, editorLogic, clientService, routes, serverService] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/services/key-moments.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/key-moments.mjs", import.meta.url), "utf8"),
    readFile(new URL("../domains/key-moments/service.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(editorPage, /catchlongpress="handleImageLongPress"/);
  assert.match(editorPage, /catchtouchmove="handleImageTouchMove"/);
  assert.doesNotMatch(editorPage, /drag-handle/);
  assert.doesNotMatch(editorPage, /长按图片可拖动排序|image-sort-hint/);
  assert.match(editorPage, /class="image-drag-ghost"/);
  assert.match(editorStyles, /\.image-grid__item--dragging[\s\S]*?opacity/);
  assert.match(editorStyles, /\.image-drag-ghost[\s\S]*?position: fixed/);
  assert.match(editorLogic, /handleImageLongPress[\s\S]*?wx\.vibrateShort/);
  assert.match(editorLogic, /handleImageTouchMove[\s\S]*?editorImages\.splice\(targetIndex, 0, draggedImage\)/);
  assert.match(editorLogic, /stageKeyMomentImage\([\s\S]*?stagedPairs[\s\S]*?stagedPathByImageKey\.set/);
  assert.match(editorLogic, /const imagePaths = this\.data\.editorImages\.map\([\s\S]*?await updateKeyMoment\(this\.data\.editingId, \{ content, imagePaths \}\)/);
  assert.match(editorLogic, /discardStagedKeyMomentImages\(this\.data\.editingId, stagedImagePaths\)/);
  assert.match(clientService, /path: `\/api\/key-moments\/\$\{id\}\/images\/stage`/);
  assert.match(clientService, /image_paths: input\.imagePaths/);
  assert.match(routes, /app\.post\("\/api\/key-moments\/:id\/images\/stage"/);
  assert.match(routes, /app\.delete\("\/api\/key-moments\/:id\/images\/staged"/);
  assert.match(serverService, /changes\.image_paths = normalizeImagePaths\(body\.image_paths\)/);
  assert.match(serverService, /const removedPaths = current\.image_paths\.filter[\s\S]*?\.update\(changes\)/);
  assert.doesNotMatch(editorLogic, /deleteKeyMomentImage|reorderKeyMomentImages/);
  assert.doesNotMatch(clientService, /images\/order|images\/\$\{index\}/);
  assert.doesNotMatch(routes, /images\/order|images\/:index/);
});

test("key moment editor prevents duplicate save queues before the loading state renders", async () => {
  const editorLogic = await readFile(
    new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(editorLogic, /let saveEditorInFlight = false/);
  assert.match(
    editorLogic,
    /async saveEditor\(\) \{[\s\S]*?if \(saveEditorInFlight \|\| this\.data\.saving \|\| this\.data\.selectingImage\) return/,
  );
  assert.match(
    editorLogic,
    /saveEditorInFlight = true[\s\S]*?this\.setData\(\{ saving: true \}\)/,
  );
  assert.match(
    editorLogic,
    /finally \{[\s\S]*?saveEditorInFlight = false[\s\S]*?this\.setData\(\{ saving: false \}\)/,
  );
  assert.match(
    editorLogic,
    /const item = await readKeyMoment\(editingId\)/,
  );
});

test("key moment editor uses direct borderless text input and a read-only time", async () => {
  const [editorPage, editorConfig, editorLogic, clientService, serverService] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/services/key-moments.ts", import.meta.url), "utf8"),
    readFile(new URL("../domains/key-moments/service.mjs", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(editorConfig).usingComponents["app-dialog"], "/components/app-dialog/index");
  assert.equal(JSON.parse(editorConfig).navigationBarTitleText, "编辑人生节点");
  assert.match(editorPage, /title="\{\{editingId \? '编辑人生节点' : '新增人生节点'\}\}"/);
  assert.match(
    editorPage,
    /<textarea[\s\S]*?class="content-editor"[\s\S]*?bindinput="handleEditorContentInput"/,
  );
  assert.match(editorPage, /class="readonly-time">\{\{editorDateTimeLabel\}\}<\/view>/);
  assert.match(editorPage, /maxlength="\{\{maxContentLength\}\}"/);
  assert.match(editorPage, /\{\{editorContent\.length\}\} \/ \{\{maxContentLength\}\}/);
  assert.match(editorPage, /placeholder="不必是大事，只要这一刻对你重要，就值得记录。"/);
  assert.doesNotMatch(editorPage, /写下这个关键节点/);
  assert.doesNotMatch(editorPage, /节点文字|节点图片|<picker/);
  assert.match(editorPage, /<app-dialog[\s\S]*?title="放弃未保存的更改？"/);
  assert.match(editorLogic, /const MAX_CONTENT_LENGTH = 2_000/);
  assert.match(editorLogic, /maxContentLength: MAX_CONTENT_LENGTH/);
  assert.match(editorLogic, /handleEditorContentInput\([\s\S]*?editorContent: event\.detail\.value/);
  assert.match(editorLogic, /const content = this\.data\.editorContent\.trim\(\)/);
  assert.doesNotMatch(editorLogic, /handleEditorDateChange|handleEditorTimeChange|contentEditorVisible/);
  assert.match(editorLogic, /updateKeyMoment\(this\.data\.editingId, \{ content, imagePaths \}\)/);
  assert.match(clientService, /input: \{ content: string; imagePaths\?: string\[\] \}[\s\S]*?content: input\.content[\s\S]*?image_paths: input\.imagePaths/);
  assert.match(serverService, /const MAX_CONTENT_LENGTH = 2_000/);
  assert.match(serverService, /function normalizeContent[\s\S]*?const content = value\.trim\(\)/);
  assert.match(serverService, /content\.length <= MAX_CONTENT_LENGTH/);
  assert.match(serverService, /文案不能超过 2000 个字/);
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
  assert.match(page, /<picker[\s\S]*?mode="date"[\s\S]*?fields="\{\{activeGranularity\}\}"[\s\S]*?bindchange="handleAnchorDateChange"/);
  assert.match(page, /class="today-publisher__label">今天<\/view>/);
  assert.match(page, /class="timeline-year-heading">\{\{item\.heading_year\}\}<\/view>/);
  assert.match(page, /wx:if="\{\{item\.show_date_heading\}\}" class="timeline-date"[\s\S]*?timeline-date__month[\s\S]*?timeline-date__day/);
  assert.match(page, /class="moment-time">\{\{item\.heading_time\}\}<\/view>/);
  assert.match(page, /class="moment-content"[\s\S]*?moment-content__text--clamped[\s\S]*?class="moment-gallery/);
  assert.match(page, /class="moment-content__expand"[\s\S]*?catchtap="handleExpandContent"[\s\S]*?>展开全文<\/view>/);
  assert.match(page, /class="moment-content__measure"[\s\S]*?aria-hidden="\{\{true\}\}"/);
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
  assert.match(styles, /\.moment-content__text--clamped[\s\S]*?-webkit-line-clamp: 7/);
  assert.match(styles, /\.moment-content__expand[\s\S]*?min-height: 56rpx[\s\S]*?font-size: var\(--ui-font-size-base\)/);
  assert.doesNotMatch(styles, /moment-card--vertical|moment-card--horizontal/);
  assert.doesNotMatch(logic, /getKeyMomentDisplayLayout|handleSettings|displayLayout/);
  assert.match(logic, /activeGranularity: "year" as KeyMomentGranularity/);
  assert.match(logic, /periodLabel: periodLabel\("year", INITIAL_DATE_TIME\.date\)/);
  assert.match(logic, /show_item_divider: index < items\.length - 1/);
  assert.match(logic, /heading_time: `\$\{pad\(parts\.hour\)\}:\$\{pad\(parts\.minute\)\}`/);
  assert.match(logic, /show_date_heading: showDateHeading/);
  assert.match(logic, /measureCollapsedContent\(\)[\s\S]*?fullRects\[index\]\.height > collapsedRects\[index\]\.height \+ 1/);
  assert.match(logic, /handleExpandContent\([\s\S]*?content_expanded`\]: true/);
  assert.match(logic, /previousParts\.year !== parts\.year[\s\S]*?previousParts\.month !== parts\.month[\s\S]*?previousParts\.day !== parts\.day/);
  assert.doesNotMatch(logic, /show_date_divider|isSameShanghaiDate/);
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
    readFile(new URL("../../src/pages/key-moments/services/key-moments.ts", import.meta.url), "utf8"),
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
  assert.match(service, /if \(cached\?\.fresh\) \{[\s\S]*?next_cursor: cached\.nextCursor/);
  assert.match(service, /pendingKeyMomentRequests/);
  assert.match(service, /updateCachedKeyMoment\(data\.item\)/);
  assert.match(service, /removeCachedKeyMoment\(id\)/);
  assert.match(cache, /KEY_MOMENT_CACHE_FRESH_MS = 10 \* 60 \* 1000/);
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
  assert.match(routes, /app\.post\("\/api\/key-moments\/drafts\/:id\/images"[\s\S]*?checkImage\(image\)/);
  assert.match(storage, /uploadStandardImage/);
  assert.doesNotMatch(storage, /thumbnailResult|THUMBNAIL_UPLOAD_FAILED/);
  assert.match(imageProcessing, /STANDARD_IMAGE_PROFILE[\s\S]*?width: 2_560[\s\S]*?quality: 88/);
  assert.doesNotMatch(imageProcessing, /thumbnail:/);
});

test("key moment detail scrolls long content and lazily pages nearby horizontal slides", async () => {
  const [page, styles, logic, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/detail/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/detail/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<swiper[\s\S]*?bindchange="handleSwiperChange"/);
  assert.doesNotMatch(page, /vertical="\{\{true\}\}"/);
  assert.match(page, /<scroll-view[\s\S]*?class="detail-slide"[\s\S]*?scroll-y/);
  assert.match(page, /<custom-navigation[\s\S]*?title="详情"/);
  assert.doesNotMatch(page, /swipe-guide|上下滑动切换节点|position_label/);
  assert.match(page, /class="detail-content"[\s\S]*?class="detail-gallery/);
  assert.match(page, /wx:for="\{\{item\.image_urls\}\}"/);
  assert.match(page, /detail-image--single[\s\S]*?detail-image--grid/);
  assert.match(page, /bindload="handleSingleImageLoad"/);
  assert.match(page, /lazy-load/);
  assert.match(page, /\{\{item\.date_label\}\} \{\{item\.time_label\}\}/);
  assert.doesNotMatch(styles, /\.detail-sheet\s*\{[^}]*overflow: hidden/);
  assert.match(styles, /\.detail-gallery[\s\S]*?grid-template-columns: repeat\(3, 1fr\)/);
  assert.match(styles, /\.detail-image--grid[\s\S]*?width: 100%;[\s\S]*?height: 195rpx/);
  const detailFooterStyles = styles.match(/\.detail-footer\s*\{([^}]*)\}/)?.[1] || "";
  assert.doesNotMatch(detailFooterStyles, /border-(?:top|bottom)/);
  assert.match(logic, /getKeyMomentContext\(focusId\)/);
  assert.match(logic, /loadMore\(direction: "newer" \| "older"\)/);
  assert.match(logic, /handleSingleImageLoad\([\s\S]*?sourceRatio[\s\S]*?single_image_style/);
  assert.match(logic, /wx\.previewImage\(\{ current, urls: item\.image_urls \}\)/);
  const keyMomentPackage = JSON.parse(appConfig).subPackages.find((entry) => entry.root === "pages/key-moments");
  assert.ok(keyMomentPackage.pages.includes("detail/index"));
});

test("new key moments stage every image before one idempotent final create", async () => {
  const [editor, clientService, routes, serverService] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/services/key-moments.ts", import.meta.url), "utf8"),
    readFile(new URL("../routes/key-moments.mjs", import.meta.url), "utf8"),
    readFile(new URL("../domains/key-moments/service.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /draftId = await createKeyMomentDraft\(\)/);
  assert.match(editor, /stageNewKeyMomentImage\(draftId, image\.selectedImageUploadPath\)/);
  assert.match(editor, /mapWithConcurrency\(pendingIndexes, 2/);
  assert.match(editor, /createKeyMoment\(\{ id: draftId, content, occurredAt, imagePaths \}\)/);
  assert.match(editor, /await readKeyMoment\(draftId\)[\s\S]*?await updateKeyMoment\(draftId/);
  assert.doesNotMatch(editor, /appendKeyMomentImage/);
  assert.match(clientService, /path: "\/api\/key-moments\/drafts"/);
  assert.match(clientService, /path: `\/api\/key-moments\/drafts\/\$\{id\}\/images`/);
  assert.match(routes, /app\.post\("\/api\/key-moments\/drafts"/);
  assert.doesNotMatch(routes, /app\.post\("\/api\/key-moments\/:id\/images"/);
  assert.match(serverService, /body\.id === undefined \? randomUUID\(\) : assertUuid\(body\.id\)/);
  assert.match(serverService, /image_paths: imagePaths/);
  assert.match(serverService, /error\.code === "23505"/);
  assert.match(serverService, /cleanupStaleKeyMomentDraftImages/);
});

test("key moment pages distinguish errors from empty data and protect unsaved edits", async () => {
  const [page, logic, editorPage, editorLogic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/edit/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /loadError && items\.length === 0[\s\S]*?重新加载/);
  assert.match(page, /还没有人生节点/);
  assert.match(logic, /handleRetry\(\)[\s\S]*?forceRefresh: true/);
  assert.match(logic, /canPublishInPeriod/);
  assert.match(editorPage, /title="放弃未保存的更改？"/);
  assert.match(editorLogic, /hasUnsavedChanges\(\)/);
  assert.match(editorLogic, /discardNewKeyMomentImages/);
  assert.doesNotMatch(`${page}\n${editorPage}`, /关键节点/);
});

test("key moment list uses cursor pagination and a stable matching index", async () => {
  const [page, service, serverService, migration] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/services/key-moments.ts", import.meta.url), "utf8"),
    readFile(new URL("../domains/key-moments/service.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../supabase/migrations/20260815141445_optimize_key_moment_pagination.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /bindscrolltolower="handleLoadMore"/);
  assert.match(service, /cursor: options\.cursor/);
  assert.match(serverService, /decodeTimelineCursor/);
  assert.match(serverService, /orderedTimelineQuery\(request, false\)\.limit\(limit \+ 1\)/);
  assert.match(migration, /key_moments_uid_timeline_idx/i);
  assert.match(migration, /\(uid, occurred_at desc, created_at desc, id desc\)/i);
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

test("historical key moment content migration preserves old rows before validation", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608020002_key_moment_content_limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /char_length\(content\) <= 50/i);
  assert.match(migration, /not valid/i);
});

test("key moment content limit expands safely to 2000 characters", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260815065801_expand_key_moment_content_limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /begin;/i);
  assert.match(migration, /drop constraint if exists key_moments_content_check/i);
  assert.match(migration, /char_length\(content\) <= 2000/i);
  assert.match(migration, /not valid/i);
  assert.match(migration, /validate constraint key_moments_content_check/i);
  assert.match(migration, /commit;/i);
});

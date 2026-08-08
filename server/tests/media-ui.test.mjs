import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../src/pages/media/index.wxml", import.meta.url);
const stylesUrl = new URL("../../src/pages/media/index.less", import.meta.url);
const logicUrl = new URL("../../src/pages/media/index.ts", import.meta.url);
const editPageUrl = new URL("../../src/pages/media/edit/index.wxml", import.meta.url);
const editLogicUrl = new URL("../../src/pages/media/edit/index.ts", import.meta.url);
const detailPageUrl = new URL("../../src/pages/media/detail/index.wxml", import.meta.url);
const detailLogicUrl = new URL("../../src/pages/media/detail/index.ts", import.meta.url);
const detailStylesUrl = new URL("../../src/pages/media/detail/index.less", import.meta.url);
const detailConfigUrl = new URL("../../src/pages/media/detail/index.json", import.meta.url);
const compactTypographyUrl = new URL("../../src/pages/media/compact-typography.less", import.meta.url);
const navigationStylesUrl = new URL("../../src/components/custom-navigation/index.less", import.meta.url);

const mediaPageBases = [
  "../../src/pages/media/index",
  "../../src/pages/media/categories/index",
  "../../src/pages/media/category-edit/index",
  "../../src/pages/media/edit/index",
  "../../src/pages/media/detail/index",
  "../../src/pages/media/episode-edit/index",
];

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
  assert.equal(page.match(/bindtap="handleCategoryTap"/g)?.length, 4);
  assert.match(logic, /selectedCategory:[ \t]*"" as MediaType/);
  assert.doesNotMatch(logic, /overviewCategory|activeRecordType/);
  assert.match(logic, /this\.applyOverviewFilters\(\)[\s\S]*this\.applyRecordFilters\(\)/);
  assert.match(page, /bindtap="handleOverviewStatusTap"/);
  assert.match(logic, /applyOverviewFilters\(\)/);
  assert.match(page, /catchtap="handleRevisitableTap"/);
  assert.match(page, /item\.is_revisitable \? '♥' : '♡'/);
  assert.doesNotMatch(page, />值得重温<\/view>/);
  assert.match(logic, /updateMediaEntry\(id, \{ is_revisitable: nextValue \}\)/);
  assert.match(logic, /setRevisitableValue\(id, entry\.is_revisitable\)/);
  assert.match(styles, /\.record-card__revisit--active\s*\{[^}]*color:\s*#e04444;/s);
  assert.match(styles, /\.record-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
  assert.doesNotMatch(page, /包含全部分类|包含全部记录|只展示所选状态|四列卡片/);
  assert.ok(page.indexOf('class="search-row"') < page.indexOf('class="media-toolbar"'));
  assert.ok(page.indexOf('class="category-list status-list"') < page.indexOf('class="media-toolbar"'));
});

test("media controls are vertically centered and use shared typography sizes", async () => {
  const [styles, page] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);
  const explicitSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)]
    .map((match) => Number(match[1]));

  assert.match(styles, /\.record-card__revisit\s*\{[^}]*font-size:\s*36rpx;/s);
  assert.deepEqual([...new Set(explicitSizes.filter((size) => size !== 36))], []);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(
    styles,
    /\.record-card__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
  assert.match(styles, /@import "\.\/compact-typography\.less";/);
  assert.match(styles, /\.section-heading__title,[\s\S]*?font-size:\s*var\(--ui-font-size-small\);/);
  assert.match(page, /<custom-navigation title="影视记录" compact-title="\{\{true\}\}"/);
  assert.match(styles, /\.record-grid\s*\{[^}]*align-items:\s*start;/s);
  assert.doesNotMatch(styles, /\.record-card__body\s*\{[^}]*min-height:/s);
  assert.match(styles, /\.view-switch__item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.search-row__button,[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/);
});

test("the whole media module opts into the smallest typography", async () => {
  const [compactTypography, navigationStyles, ...pageFiles] = await Promise.all([
    readFile(compactTypographyUrl, "utf8"),
    readFile(navigationStylesUrl, "utf8"),
    ...mediaPageBases.flatMap((base) => [
      readFile(new URL(`${base}.less`, import.meta.url), "utf8"),
      readFile(new URL(`${base}.wxml`, import.meta.url), "utf8"),
    ]),
  ]);

  assert.match(compactTypography, /--ui-font-size-base:\s*var\(--ui-font-size-small\)/);
  assert.match(navigationStyles, /\.custom-navigation__title--compact\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);/s);
  for (let index = 0; index < pageFiles.length; index += 2) {
    const styles = pageFiles[index];
    const page = pageFiles[index + 1];
    assert.match(styles, /compact-typography\.less/);
    assert.match(page, /<custom-navigation[^>]*compact-title="\{\{true\}\}"/);
    assert.doesNotMatch(styles, /font-size:\s*(?:21|23|25|26|27|32)rpx/);
    const appInputs = page.match(/<app-input\b[\s\S]*?\/>/g) || [];
    const textareas = page.match(/<textarea\b[\s\S]*?\/>/g) || [];
    for (const input of appInputs) assert.match(input, /font-size="20rpx"/);
    for (const textarea of textareas) {
      if (textarea.includes("placeholder=")) {
        assert.match(textarea, /placeholder-style="font-size: 20rpx;"/);
      }
    }
  }
});

test("media cards show only titles, revisit hearts, and category-specific placeholders", async () => {
  const [page, logic] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(logicUrl, "utf8"),
  ]);

  assert.doesNotMatch(page, /record-card__meta|record-card__details/);
  assert.doesNotMatch(logic, /metaText|statsText|favoriteText/);
  assert.match(page, /name="\{\{item\.placeholderIcon\}\}"/);
  for (const icon of ["book-open", "sparkles", "headphones", "tv", "clapperboard"]) {
    assert.match(logic, new RegExp(`"${icon}"`));
  }
});

test("media detail inline editing supports a shared 3:4 cover crop and deferred save", async () => {
  const [page, logic, config, createPage, createLogic] = await Promise.all([
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
    readFile(detailConfigUrl, "utf8"),
    readFile(editPageUrl, "utf8"),
    readFile(editLogicUrl, "utf8"),
  ]);

  assert.match(config, /"image-cropper":\s*"\/components\/image-cropper\/index"/);
  assert.match(page, /aspect-ratio="0\.75"/);
  assert.match(page, /output-size="1080"/);
  assert.match(page, /compact-typography="\{\{true\}\}"/);
  assert.match(page, /selectedEntryImagePath/);
  assert.match(logic, /wx\.chooseMedia\(/);
  assert.match(logic, /async handleCompleteEntryEdit\(\)/);
  assert.match(logic, /persistedEntry = await updateMediaEntry\(entry\.id,/);
  assert.match(logic, /persistedEntry = await replaceMediaEntryCover\(/);
  assert.doesNotMatch(logic, /pages\/media\/edit\/index\?id|MEDIA_EDIT_ITEM/);
  assert.match(createPage, />新增影视<\/view>/);
  assert.match(createLogic, /await createMediaEntry\(input\)/);
  assert.doesNotMatch(createLogic, /getMediaEntry|updateMediaEntry|deleteMediaEntry|MEDIA_EDIT_ITEM/);
});

test("media platform/source is optional and no longer offers the pending placeholder", async () => {
  const [createPage, createLogic, detailLogic] = await Promise.all([
    readFile(editPageUrl, "utf8"),
    readFile(editLogicUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
  ]);

  assert.match(createPage, /平台\/来源（选填，可多选）/);
  assert.doesNotMatch(createPage, /待定|平台\/来源（必填/);
  assert.doesNotMatch(createLogic, /待定|请选择平台\/来源/);
  assert.doesNotMatch(detailLogic, /待定|请选择平台\/来源/);
  assert.match(detailLogic, /return supported\.length \? supported\.join\("、"\) : "未填写"/);
  assert.match(detailLogic, /platforms = \[\.\.\.new Set\(this\.data\.entryDraftPlatforms\)\]/);
});

test("all media cards open the shared read-only detail page before editing", async () => {
  const [indexLogic, detailPage, detailLogic] = await Promise.all([
    readFile(logicUrl, "utf8"),
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
  ]);

  const openEntry = indexLogic.slice(
    indexLogic.indexOf("openMediaEntry(id: string)"),
    indexLogic.indexOf("handleRetry()"),
  );
  assert.match(openEntry, /pages\/media\/detail\/index\?id=\$\{id\}/);
  assert.doesNotMatch(openEntry, /pages\/media\/edit|EPISODIC_MEDIA_TYPES|MEDIA_EDIT_ITEM/);
  assert.match(detailPage, /wx:if="\{\{isEpisodic\}\}"/);
  assert.match(detailPage, /bindtap="handleEditEntry"/);
  assert.match(detailPage, /aria-label="完成编辑"[\s\S]*?bindtap="handleCompleteEntryEdit"[\s\S]*?name="check"/);
  assert.match(detailPage, /wx:if="\{\{editingEntry\}\}"/);
  assert.doesNotMatch(detailLogic, /wx\.navigateTo\(\{ url: `\/pages\/media\/edit/);
  assert.match(detailLogic, /normalizedSeasons\.length > 0 \|\| EPISODIC_MEDIA_TYPES\.includes\(entry\.media_type\)/);
});

test("media detail defaults to the detail tab and keeps plot records fully expanded", async () => {
  const [page, logic, styles] = await Promise.all([
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
    readFile(detailStylesUrl, "utf8"),
  ]);

  assert.ok(page.indexOf('class="detail-tabs"') < page.indexOf('class="detail-content"'));
  assert.match(page, /data-tab="detail"[\s\S]*?>详情<\/view>/);
  assert.match(page, /data-tab="records"[\s\S]*?>剧情记录<\/view>/);
  assert.match(logic, /activeDetailTab:\s*"detail"/);
  assert.match(page, /wx:elif="\{\{item\.plot_summary \|\| item\.timeline_notes\.length\}\}" class="episode-row__preview"/);
  assert.doesNotMatch(logic, /handleEpisodePreviewTap|expandedEpisodeId/);
  assert.doesNotMatch(page, /episode-row__chevron|chevron-down/);
  assert.match(page, /catchtap="handleEpisodeEdit"/);
  assert.match(page, /bindsubmit="handleEpisodeSave"/);
  assert.match(page, /form-type="submit"[\s\S]*?>保存<\/button>/);
  assert.match(page, /wx:if="\{\{editingEpisodeId === item\.id\}\}" class="episode-editor"/);
  assert.match(page, /episode-editor__label">单集标题/);
  assert.match(page, /episode-editor__label">整集概括/);
  assert.match(page, /episode-editor__label">记录类型/);
  assert.match(page, /episode-editor__label">时间/);
  assert.match(page, /episode-editor__label">剧情内容/);
  assert.match(logic, /const updatedEpisode = await updateMediaEpisode\(id,/);
  assert.doesNotMatch(logic, /MEDIA_EPISODE_EDIT|pages\/media\/episode-edit/);
  assert.match(page, /<view class="timeline-filter-panel">/);
  assert.doesNotMatch(logic, /timelineFilterOpen|handleTimelineFilterToggle/);
  assert.match(page, /aria-label="新增季"/);
  assert.match(page, /data-status="planned"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.match(page, /data-status="in_progress"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.match(page, /data-status="completed"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.ok(page.indexOf('class="detail-status-options') < page.indexOf('detail-attribute__label">名称'));
  assert.match(page, /detail-attribute__label">名称[\s\S]*?\{\{entry\.title\}\}/);
  assert.match(logic, /updateMediaEntry\(entry\.id, \{ watch_status: watchStatus \}\)/);
  assert.doesNotMatch(page, /detail-attribute__label">状态/);
  assert.doesNotMatch(page, /handleDeleteEntry/);
  assert.match(styles, /\.detail-cover\s*\{[^}]*width:\s*320rpx;[^}]*height:\s*427rpx;/s);
  assert.match(styles, /\.detail-attributes\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.doesNotMatch(styles, /\.detail-attributes\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.active-season-bar__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);/s);
  assert.match(page, /wx:if="\{\{activeSeason\.cover_url\}\}" class="active-season-bar__cover" src="\{\{activeSeason\.cover_url\}\}"/);
  assert.match(styles, /\.active-season-bar__cover\s*\{[^}]*width:\s*112rpx;[^}]*height:\s*149rpx;/s);
  assert.match(styles, /\.episode-row__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);/s);
  assert.match(styles, /\.episode-row__meta\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);/s);
});

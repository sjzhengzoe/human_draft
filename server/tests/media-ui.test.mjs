import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageUrl = new URL("../../src/pages/media/index.wxml", import.meta.url);
const stylesUrl = new URL("../../src/pages/media/index.less", import.meta.url);
const logicUrl = new URL("../../src/pages/media/index.ts", import.meta.url);
const editPageUrl = new URL("../../src/pages/media/edit/index.wxml", import.meta.url);
const editLogicUrl = new URL("../../src/pages/media/edit/index.ts", import.meta.url);
const editConfigUrl = new URL("../../src/pages/media/edit/index.json", import.meta.url);
const detailPageUrl = new URL("../../src/pages/media/detail/index.wxml", import.meta.url);
const detailLogicUrl = new URL("../../src/pages/media/detail/index.ts", import.meta.url);
const detailStylesUrl = new URL("../../src/pages/media/detail/index.less", import.meta.url);

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
  const styles = await readFile(stylesUrl, "utf8");
  const explicitSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)]
    .map((match) => Number(match[1]));

  assert.match(styles, /\.record-card__revisit\s*\{[^}]*font-size:\s*36rpx;/s);
  assert.deepEqual([...new Set(explicitSizes.filter((size) => size !== 36))], [25]);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(
    styles,
    /\.record-card__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
  assert.match(styles, /\.record-grid\s*\{[^}]*align-items:\s*start;/s);
  assert.doesNotMatch(styles, /\.record-card__body\s*\{[^}]*min-height:/s);
  assert.match(styles, /\.view-switch__item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.search-row__button,[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;/);
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
  assert.match(logic, /updateMediaEntry\(entry\.id, \{ watch_status: watchStatus \}\)/);
  assert.doesNotMatch(page, /detail-attribute__label">状态/);
  assert.doesNotMatch(page, /handleDeleteEntry/);
  assert.match(styles, /\.detail-cover\s*\{[^}]*width:\s*320rpx;[^}]*height:\s*427rpx;/s);
  assert.match(styles, /\.detail-attributes\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s);
  assert.match(styles, /\.active-season-bar__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);/s);
  assert.match(page, /wx:if="\{\{activeSeason\.cover_url\}\}" class="active-season-bar__cover" src="\{\{activeSeason\.cover_url\}\}"/);
  assert.match(styles, /\.active-season-bar__cover\s*\{[^}]*width:\s*112rpx;[^}]*height:\s*149rpx;/s);
  assert.match(styles, /\.episode-row__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);/s);
  assert.match(styles, /\.episode-row__meta\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);/s);
});

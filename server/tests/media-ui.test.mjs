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
const seasonManagePageUrl = new URL("../../src/pages/media/season-manage/index.wxml", import.meta.url);
const seasonManageLogicUrl = new URL("../../src/pages/media/season-manage/index.ts", import.meta.url);
const seasonManageStylesUrl = new URL("../../src/pages/media/season-manage/index.less", import.meta.url);
const seasonManageConfigUrl = new URL("../../src/pages/media/season-manage/index.json", import.meta.url);

const mediaPageBases = [
  "../../src/pages/media/index",
  "../../src/pages/media/categories/index",
  "../../src/pages/media/edit/index",
  "../../src/pages/media/detail/index",
  "../../src/pages/media/season-manage/index",
  "../../src/pages/media/episode-edit/index",
];

test("media category names use the shared bottom editor", async () => {
  const [page, logic, config, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/media/categories/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/categories/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/media/categories/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);

  const components = JSON.parse(config).usingComponents;
  assert.equal(components["app-dialog"], "/components/app-dialog/index");
  assert.equal(components["app-input"], "/components/app-input/index");
  assert.match(page, /<app-dialog[\s\S]*?placement="bottom"[\s\S]*?title="\{\{editorId \? '编辑影视分类' : '新增影视分类'\}\}"/);
  assert.match(page, /<app-input[\s\S]*?maxlength="40"[\s\S]*?dialog-mode/);
  assert.match(logic, /createMediaCategory/);
  assert.match(logic, /updateMediaCategory/);
  assert.match(logic, /deleteMediaCategory/);
  assert.doesNotMatch(logic, /pages\/media\/category-edit/);
  const mediaPackage = JSON.parse(appConfig).subPackages.find((item) => item.root === "pages/media");
  assert.ok(mediaPackage);
  assert.ok(!mediaPackage.pages.includes("category-edit/index"));
});

test("finished media shows five-star personal ratings in every list", async () => {
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
  assert.doesNotMatch(page, /swiper|status-badge/);
  assert.doesNotMatch(page, /overviewCategoryOptions|handleOverviewCategoryChange/);
  assert.equal(page.match(/bindtap="handleCategoryTap"/g)?.length, 2);
  assert.match(logic, /selectedCategory:[ \t]*"" as MediaType/);
  assert.doesNotMatch(logic, /overviewCategory|activeRecordType/);
  assert.match(logic, /handleCategoryTap[\s\S]*loadCurrentView\(\{ reset: true \}\)/);
  assert.match(page, /bindtap="handleOverviewStatusTap"/);
  assert.match(page, /class="media-filter-label">评分：<\/view>/);
  assert.match(page, /data-rating="0" bindtap="handleRatingTap">全部<\/view>/);
  assert.match(page, /wx:for="\{\{ratingOptions\}\}"[\s\S]*?data-rating="\{\{item\.value\}\}"[\s\S]*?bindtap="handleRatingTap">\{\{item\.label\}\}<\/view>/);
  assert.match(logic, /\{ value: 5, label: "五星" \}[\s\S]*\{ value: 1, label: "一星" \}/);
  assert.ok(page.indexOf("<block wx:else>") < page.indexOf(">评分："));
  assert.match(logic, /showSelectedOverviewStatus\(\)/);
  assert.equal(page.match(/class="record-card__rating"/g)?.length, 2);
  assert.equal(page.match(/wx:if="\{\{item\.watch_status === 'completed'\}\}" class="record-card__rating"/g)?.length, 2);
  assert.match(page, /wx:for="\{\{item\.ratingStars\}\}"/);
  assert.match(page, /ratingStar\.filled \? '★' : '☆'/);
  assert.doesNotMatch(page, /handleRevisitableTap|record-card__revisit|值得重温/);
  assert.match(logic, /function sortByRating/);
  assert.match(logic, /entry\.watch_status === "completed" && Number\.isInteger\(entry\.personal_rating\)/);
  assert.match(logic, /function overviewQuery[\s\S]*?sort: "created_desc"/);
  assert.match(logic, /function recordQuery[\s\S]*?sort: "rating_desc"/);
  assert.match(logic, /personalRating: personalRating \|\| undefined/);
  assert.match(logic, /handleRatingTap[\s\S]*?selectedRating[\s\S]*?loadCurrentView\(\{ reset: true \}\)/);
  assert.doesNotMatch(logic, /handleRevisitableTap|setRevisitableValue/);
  assert.match(styles, /\.record-card__rating-star--filled\s*\{[^}]*color:\s*var\(--media-color-rating\);/s);
  assert.match(styles, /\.record-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s);
  assert.equal(page.match(/class="record-card__overlay"/g)?.length, 2);
  assert.match(styles, /\.record-card__overlay\s*\{[^}]*position:\s*absolute;[^}]*background:\s*linear-gradient\(to bottom, transparent, var\(--ui-color-overlay-strong\)\);/s);
  assert.match(styles, /\.record-card__title\s*\{[^}]*color:\s*var\(--ui-color-text-inverse\);/s);
  assert.doesNotMatch(page, /record-card__body/);
  assert.doesNotMatch(styles, /\.record-card\s*\{[^}]*border:\s*1rpx|\.record-card\s*\{[^}]*box-shadow:/s);
  assert.doesNotMatch(page, /包含全部分类|包含全部记录|只展示所选状态|四列卡片/);
  assert.match(page, /class="media-filter-row media-filter-row--category"[\s\S]*?class="media-filter-label">分类：[\s\S]*?class="media-filter-scroll"/);
  assert.match(page, /class="media-filter-row media-filter-row--secondary"[\s\S]*?class="media-filter-label">状态：[\s\S]*?class="category-list status-list"/);
  assert.match(page, /class="media-command-row"[\s\S]*?class="search-row"[\s\S]*?<app-icon name="search" size="24"[\s\S]*?<app-input[\s\S]*?persistent[\s\S]*?class="media-command-actions"[\s\S]*?aria-label="新增影视"[\s\S]*?aria-label="更多影视操作"/);
  assert.match(page, /<app-input[^>]*persistent[^>]*clearable[^>]*clear-aria-label="清空作品搜索"/);
  assert.doesNotMatch(page, /search-row__clear|>清除<\/view>/);
  assert.match(page, /<app-dialog[\s\S]*?visible="\{\{moreMenuVisible\}\}"[\s\S]*?placement="bottom"[\s\S]*?管理影视分类/);
  assert.doesNotMatch(page, /class="media-filter-actions"/);
  assert.ok(page.indexOf('class="category-list rating-list"') < page.indexOf('class="search-row"'));
  assert.doesNotMatch(page, /filter-heading|media-toolbar|category-list--wrap/);
});

test("media controls are vertically centered and use shared typography sizes", async () => {
  const [styles, page] = await Promise.all([
    readFile(stylesUrl, "utf8"),
    readFile(pageUrl, "utf8"),
  ]);
  const explicitSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)]
    .map((match) => Number(match[1]));

  assert.deepEqual([...new Set(explicitSizes)], []);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(
    styles,
    /\.record-card__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-base\);[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/s,
  );
  assert.doesNotMatch(styles, /compact-typography/);
  assert.match(styles, /\.section-heading__title,[\s\S]*?font-size:\s*var\(--ui-font-size-large\);/);
  assert.match(page, /<custom-navigation title="影视片单"\s*\/>/);
  assert.match(styles, /\.record-grid\s*\{[^}]*align-items:\s*start;/s);
  assert.match(styles, /\.record-card__rating\s*\{[^}]*font-size:\s*var\(--ui-font-size-small\);/s);
  assert.doesNotMatch(styles, /\.record-card__body\s*\{[^}]*min-height:/s);
  assert.match(styles, /\.view-switch__item\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.icon-button\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.media-command-row\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;/s);
  assert.match(styles, /\.search-row__field\s*\{[^}]*min-height:\s*58rpx;[^}]*gap:\s*12rpx;[^}]*padding:\s*0 18rpx;/s);
});

test("media result headings stay fixed while only result lists scroll to a safe bottom", async () => {
  const [page, styles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  const scrollStart = page.indexOf('<scroll-view\n    class="content-scroll"');
  assert.ok(scrollStart > 0);
  assert.ok(page.indexOf('class="section-heading content-heading"') < scrollStart);
  assert.ok(page.indexOf('class="record-heading content-heading"') < scrollStart);
  assert.match(styles, /\.content-scroll\s*\{[^}]*min-height:\s*0;[^}]*height:\s*0;[^}]*flex:\s*1;/s);
  assert.match(styles, /\.record-grid\s*\{[^}]*padding:[^;]*env\(safe-area-inset-bottom\)/s);
});

test("the whole media module follows the shared three-tier typography", async () => {
  const pageFiles = await Promise.all([
    ...mediaPageBases.flatMap((base) => [
      readFile(new URL(`${base}.less`, import.meta.url), "utf8"),
      readFile(new URL(`${base}.wxml`, import.meta.url), "utf8"),
    ]),
  ]);

  for (let index = 0; index < pageFiles.length; index += 2) {
    const styles = pageFiles[index];
    const page = pageFiles[index + 1];
    assert.doesNotMatch(styles, /compact-typography/);
    assert.doesNotMatch(page, /compact-title|compact-typography/);
    assert.doesNotMatch(styles, /font-size:\s*\d+rpx/);
    const appInputs = page.match(/<app-input\b[\s\S]*?\/>/g) || [];
    const textareas = page.match(/<textarea\b[\s\S]*?\/>/g) || [];
    for (const input of appInputs) assert.doesNotMatch(input, /font-size="/);
    for (const textarea of textareas) {
      if (textarea.includes("placeholder=")) {
        assert.match(textarea, /placeholder-class="ui-input-placeholder"/);
      }
    }
  }
});

test("media cards show only titles, record ratings, and category-specific placeholders", async () => {
  const [page, logic] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(logicUrl, "utf8"),
  ]);

  assert.doesNotMatch(page, /record-card__meta|record-card__details/);
  assert.doesNotMatch(logic, /metaText|statsText|favoriteText/);
  assert.doesNotMatch(page, /record-card__revisit|♥|♡/);
  assert.match(page, /record-card__rating-star/);
  assert.match(page, /name="\{\{item\.placeholderIcon\}\}"/);
  for (const icon of ["book-open", "sparkles", "headphones", "tv", "clapperboard"]) {
    assert.match(logic, new RegExp(`"${icon}"`));
  }
});

test("media detail attributes edit independently and cover crop saves immediately", async () => {
  const [page, logic, config, createPage, createLogic] = await Promise.all([
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
    readFile(detailConfigUrl, "utf8"),
    readFile(editPageUrl, "utf8"),
    readFile(editLogicUrl, "utf8"),
  ]);

  assert.match(config, /"image-cropper":\s*"\/components\/image-cropper\/index"/);
  assert.match(page, /aspect-ratio="0\.75"/);
  assert.doesNotMatch(page, /output-size=/);
  assert.doesNotMatch(page, /compact-typography/);
  assert.match(page, /selectedEntryImagePath/);
  assert.match(logic, /wx\.chooseMedia\(/);
  assert.doesNotMatch(page, /aria-label="编辑作品"|handleEditEntry|完成编辑|取消编辑/);
  assert.match(page, /aria-label="更换作品封面"[\s\S]*?bindtap="handleEntryCoverTap"/);
  assert.match(logic, /async saveEntryCover\(/);
  assert.match(logic, /const persistedEntry = await replaceMediaEntryCover\(/);
  assert.match(page, /aria-label="修改名称"[\s\S]*?bindtap="handleEntryTitleTap"/);
  assert.match(page, /aria-label="修改分类"[\s\S]*?bindtap="handleEntryCategoryTap"/);
  assert.match(page, /aria-label="修改平台或来源"[\s\S]*?bindtap="handleEntryPlatformsTap"/);
  assert.match(logic, /async saveEntryProperties\(/);
  assert.doesNotMatch(logic, /handleCompleteEntryEdit|editingEntry/);
  assert.doesNotMatch(logic, /pages\/media\/edit\/index\?id|MEDIA_EDIT_ITEM/);
  assert.match(createPage, /<custom-navigation title="新增影视"/);
  assert.doesNotMatch(createPage, /record-overview/);
  assert.match(createPage, /class="save-bar"/);
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

test("all media cards open the shared detail page with property-level editors", async () => {
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
  assert.doesNotMatch(detailPage, /handleEditEntry|handleCompleteEntryEdit|editingEntry/);
  assert.match(detailPage, /bindtap="handleEntryTitleTap"/);
  assert.match(detailPage, /entryChoiceDialogVisible/);
  assert.doesNotMatch(detailLogic, /wx\.navigateTo\(\{ url: `\/pages\/media\/edit/);
  assert.match(detailLogic, /normalizedSeasons\.length > 0 \|\| EPISODIC_MEDIA_TYPES\.includes\(entry\.media_type\)/);
});

test("media detail embeds a ranged episode picker with short plot summaries", async () => {
  const [page, logic, styles, config] = await Promise.all([
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
    readFile(detailStylesUrl, "utf8"),
    readFile(detailConfigUrl, "utf8"),
  ]);

  assert.equal(JSON.parse(config).disableScroll, true);
  assert.match(page, /class="page page--fixed"/);
  assert.doesNotMatch(page, /detail-tabs|data-tab="records"|>剧情记录<\/view>/);
  assert.ok(page.indexOf('class="detail-attributes"') < page.indexOf('class="episode-picker"'));
  assert.match(page, /class="episode-picker__title">选集<\/view>/);
  assert.match(page, /wx:if="\{\{episodeRangeOptions\.length > 1\}\}" class="episode-picker__range-row"/);
  assert.match(page, /bindtap="handleEpisodeRangeDialogOpen"/);
  assert.match(page, /class="episode-picker__episodes-scroll" scroll-x/);
  assert.match(page, /wx:for="\{\{episodePickerEpisodes\}\}"/);
  assert.match(page, /class="episode-picker__track"/);
  assert.match(page, /title="快速选集"[\s\S]*?custom-actions="\{\{true\}\}"/);
  assert.match(page, /class="episode-range-dialog__option[\s\S]*?bindtap="handleEpisodeRangeTap"/);
  assert.match(page, /class="episode-card__number">第 \{\{item\.episode_number\}\} 集/);
  assert.match(page, /\{\{item\.plot_summary \|\| '点击添加剧情详情'\}\}/);
  assert.match(page, /catchtap="handleFavoriteTap"/);
  assert.match(page, /bindtap="handleEpisodeSummaryTap"/);
  assert.match(page, /placement="bottom"[\s\S]*?maxlength="\{\{textSheetMaxlength\}\}"/);
  assert.match(page, /textSheetPurpose === 'episode-summary'[\s\S]*?\{\{textSheetValue\.length\}\} \/ 20/);
  assert.match(logic, /const EPISODE_RANGE_SIZE = 50/);
  assert.match(logic, /Math\.ceil\(episodeCount \/ EPISODE_RANGE_SIZE\)/);
  assert.match(logic, /handleEpisodeRangeDialogOpen/);
  assert.match(logic, /episodeRangeDialogVisible: false/);
  assert.match(logic, /handleEpisodeSummaryTap/);
  assert.match(logic, /textSheetMaxlength: 20/);
  assert.match(logic, /剧情详情不能超过 20 个字/);
  assert.match(logic, /updateMediaEpisode\(episodeId, \{ plot_summary: plotSummary \}\)/);
  assert.match(page, /aria-label="管理季和集"[\s\S]*?bindtap="handleSeasonManage"/);
  assert.doesNotMatch(page, /aria-label="新增季"/);
  assert.match(page, /data-status="planned"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.match(page, /data-status="in_progress"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.match(page, /data-status="completed"[\s\S]*?bindtap="handleWatchStatusTap"/);
  assert.doesNotMatch(page, /aria-label="编辑作品"|handleEditEntry|完成编辑/);
  assert.match(page, /class="detail-title-actions"[\s\S]*?class="special-favorite-toggle/);
  assert.match(page, /title="\{\{entryChoiceDialogPurpose === 'category' \? '修改分类' : '修改平台\/来源'\}\}"/);
  assert.match(styles, /\.entry-choice-dialog__option--active\s*\{[^}]*background:\s*var\(--ui-color-action-primary\);[^}]*color:\s*var\(--ui-color-text-inverse\);/s);
  assert.doesNotMatch(page, /detail-attribute__label">特别喜爱/);
  assert.ok(page.indexOf('class="detail-status-options') < page.indexOf('class="detail-minimal"'));
  assert.match(page, /class="detail-minimal__title"[\s\S]*?bindtap="handleEntryTitleTap"[\s\S]*?\{\{entry\.title\}\}/);
  assert.match(page, /class="detail-minimal__meta"[\s\S]*?bindtap="handleEntryCategoryTap"[\s\S]*?detail-minimal__separator[\s\S]*?bindtap="handleEntryPlatformsTap"/);
  assert.doesNotMatch(page, /detail-attribute__label">名称|detail-attribute__label">分类|detail-attribute__label">平台\/来源/);
  const minimalDetails = page.slice(page.indexOf('class="detail-minimal"'), page.indexOf('</view>\n        </view>\n\n        <view wx:if="{{isEpisodic}}"'));
  assert.doesNotMatch(minimalDetails, /<app-icon|chevron-right|name="pencil"/);
  assert.ok(page.indexOf('class="detail-fixed"') < page.indexOf('class="detail-attribute-scroll"'));
  assert.ok(page.indexOf('class="detail-status-options') < page.indexOf('class="detail-attribute-scroll"'));
  assert.match(page, /class="detail-attribute-scroll"[\s\S]*?bindrefresherrefresh="handleDetailPullRefresh"[\s\S]*?class="detail-attributes"/);
  assert.match(logic, /updateMediaEntry\(entry\.id, \{ watch_status: watchStatus \}\)/);
  assert.match(logic, /pages\/media\/season-manage\/index\?id=/);
  assert.doesNotMatch(logic, /onPageScroll|pageScrollTo|savedPageScrollTop/);
  assert.doesNotMatch(page, /detail-attribute__label">状态/);
  assert.doesNotMatch(page, /detail-attribute__label">剧集/);
  assert.doesNotMatch(page, /handleDeleteEntry/);
  assert.match(styles, /\.detail-cover\s*\{[^}]*width:\s*320rpx;[^}]*height:\s*427rpx;/s);
  assert.match(styles, /\.detail-attributes\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s);
  assert.match(styles, /\.page\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden;/s);
  assert.match(styles, /\.detail-content\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*flex-direction:\s*column;/s);
  assert.match(styles, /\.detail-attribute-scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s);
  assert.doesNotMatch(styles, /\.detail-attributes\s*\{[^}]*grid-template-columns:/s);
  assert.match(styles, /\.detail-minimal__title\s*\{[^}]*min-height:\s*56rpx;[^}]*font-size:\s*var\(--ui-font-size-large\);/s);
  assert.match(styles, /\.detail-minimal__meta-item\s*\{[^}]*min-height:\s*56rpx;/s);
  assert.doesNotMatch(styles, /\.episode-picker\s*\{[^}]*border-top:/s);
  assert.match(styles, /\.episode-picker__track\s*\{[^}]*display:\s*inline-flex;/s);
  assert.match(styles, /\.episode-card\s*\{[^}]*width:\s*284rpx;[^}]*flex:\s*0 0 284rpx;/s);
  assert.match(styles, /\.episode-picker__tab--active\s*\{[^}]*background:\s*var\(--ui-color-action-primary\);[^}]*color:\s*var\(--ui-color-text-inverse\);/s);
  assert.match(styles, /\.episode-range-dialog__option--active\s*\{[^}]*background:\s*var\(--ui-color-action-primary\);[^}]*color:\s*var\(--ui-color-text-inverse\);/s);
  assert.match(styles, /\.episode-card__favorite\s*\{[^}]*width:\s*56rpx;[^}]*height:\s*56rpx;/s);
});

test("season management uses one accordion draft page and saves once", async () => {
  const [page, logic, styles, config, appConfig, service] = await Promise.all([
    readFile(seasonManagePageUrl, "utf8"),
    readFile(seasonManageLogicUrl, "utf8"),
    readFile(seasonManageStylesUrl, "utf8"),
    readFile(seasonManageConfigUrl, "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/media.ts", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(config).disableScroll, true);
  assert.match(page, /custom-back bind:back="handleBack"/);
  assert.match(page, /wx:for="\{\{draftSeasons\}\}"/);
  assert.match(page, /expandedSeasonKey === item\.key/);
  assert.match(page, /bindtap="handleSeasonToggle"/);
  assert.match(page, /maxlength="20"[\s\S]*?bindinput="handleEpisodeSummaryInput"/);
  assert.match(page, /episode-editor-row__favorite[\s\S]*?bindtap="handleEpisodeFavoriteTap"/);
  assert.match(page, /season-card__delete[^>]*catchtap="handleSeasonDeleteRequest"[\s\S]*?name="trash-2-danger"/);
  assert.doesNotMatch(page, />删除本季</);
  assert.match(page, /bindtap="handleSeasonAdd"/);
  assert.match(page, /bindtap="handleSaveRequest">保存/);
  assert.match(page, /confirmDialogPurpose === 'leave'/);
  assert.match(logic, /expandedSeasonKey: draftSeasons\[0\]\?\.key \|\| ""/);
  assert.match(logic, /this\.data\.expandedSeasonKey === key \? "" : key/);
  assert.match(logic, /dirty: true/);
  assert.match(logic, /saveMediaSeasonDrafts/);
  assert.doesNotMatch(logic, /updateMediaSeason|updateMediaEpisode|createMediaSeason|addNextMediaEpisode/);
  assert.match(service, /method: "PUT"[\s\S]*?data: \{ seasons \}/);
  assert.match(styles, /\.season-manager-save-bar\s*\{[^}]*border-top:/s);
  assert.match(styles, /\.season-list\s*\{[^}]*border-top:[^}]*\}/s);
  assert.match(styles, /\.season-card\s*\{[^}]*border-bottom:[^}]*\}/s);
  assert.doesNotMatch(styles, /\.season-card\s*\{[^}]*border-radius:/s);
  assert.match(styles, /\.episode-editor-row__favorite\s*\{[^}]*width:\s*56rpx;[^}]*height:\s*56rpx;/s);
  const mediaPackage = JSON.parse(appConfig).subPackages.find((item) => item.root === "pages/media");
  assert.ok(mediaPackage.pages.includes("season-manage/index"));
});

test("media UI keeps dense controls compact while improving long-list interactions", async () => {
  const [page, styles, logic, createPage, createLogic, detailPage, detailLogic, detailStyles] = await Promise.all([
    readFile(pageUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(logicUrl, "utf8"),
    readFile(editPageUrl, "utf8"),
    readFile(editLogicUrl, "utf8"),
    readFile(detailPageUrl, "utf8"),
    readFile(detailLogicUrl, "utf8"),
    readFile(detailStylesUrl, "utf8"),
  ]);

  assert.match(page, /<scroll-view class="media-filter-scroll" scroll-x enhanced show-scrollbar="\{\{false\}\}">/);
  assert.equal(page.match(/class="media-filter-scroll"/g)?.length, 3);
  assert.doesNotMatch(page, /category-scroll|category-list--wrap/);
  assert.match(styles, /\.media-filter-scroll\s*\{[^}]*min-width:\s*0;[^}]*flex:\s*1;[^}]*white-space:\s*nowrap;/s);
  assert.doesNotMatch(styles, /\.filter-heading|\.media-toolbar|\.category-list--wrap/);
  assert.match(page, /scroll-top="\{\{contentScrollTop\}\}"/);
  assert.match(page, /bindscroll="handleContentScroll"/);
  assert.match(page, /src="\{\{item\.coverImageUrl\}\}"/);
  assert.match(logic, /coverImageUrl: entry\.cover_url/);
  assert.doesNotMatch(logic, /normalized-v3\|cost-v4/);
  assert.match(styles, /-webkit-line-clamp:\s*2/);
  assert.match(logic, /const PAGE_SIZE = 60/);
  assert.match(logic, /SEARCH_DEBOUNCE_MS = 180/);
  assert.match(createPage, /field-label">名称[\s\S]*field-label">封面（选填）/);
  assert.match(createLogic, /MEDIA_CREATE_DRAFT_KEY/);
  assert.match(createLogic, /enableAlertBeforeUnload/);
  assert.match(detailPage, /\{\{item\.is_favorite \? '♥' : '♡'\}\}/);
  assert.match(detailPage, />我的评分<\/text>/);
  assert.match(detailPage, /wx:if="\{\{entry\.watch_status === 'completed'\}\}" class="detail-rating"/);
  assert.match(detailPage, /bindtap="handlePersonalRatingTap"/);
  assert.doesNotMatch(detailPage, /handlePersonalRatingClear|detail-rating__clear|>清除<\/view>/);
  assert.match(detailPage, /data-rating="\{\{item\}\}"/);
  assert.match(createPage, /我的评分（必填）/);
  assert.match(createPage, /新增时默认为 3 星/);
  assert.match(createLogic, /personalRating: 3/);
  assert.match(createLogic, /personal_rating: this\.data\.watchStatus === "completed"/);
  assert.match(
    createLogic,
    /finally \{[\s\S]*?wx\.hideLoading\(\)[\s\S]*?\}[\s\S]*?wx\.showToast\(\{/,
  );
  assert.match(createLogic, /toast\.icon === "none" \? ERROR_TOAST_DURATION/);
  assert.match(detailPage, /scroll-top="\{\{detailScrollTop\}\}"/);
  assert.match(detailPage, /bindscroll="handleDetailScroll"/);
  assert.match(detailLogic, /updateMediaEntry\(entry\.id, \{ personal_rating: personalRating \}\)/);
  assert.match(detailLogic, /if \(entry\.watch_status !== "completed"\) return/);
  assert.match(detailLogic, /personalRating < 1 \|\| personalRating > 5/);
  assert.match(detailLogic, /handleSpecialFavoriteChange\(\)[\s\S]*?wx\.showLoading\(\{ title: "更新中", mask: true \}\)[\s\S]*?finally \{[\s\S]*?wx\.hideLoading\(\)/);
  assert.match(detailLogic, /async setPersonalRating\(personalRating: number\)[\s\S]*?wx\.showLoading\(\{ title: "更新中", mask: true \}\)[\s\S]*?finally \{[\s\S]*?wx\.hideLoading\(\)/);
  assert.match(detailLogic, /async handleWatchStatusTap[\s\S]*?wx\.showLoading\(\{ title: "更新中", mask: true \}\)[\s\S]*?finally \{[\s\S]*?wx\.hideLoading\(\)/);
  assert.doesNotMatch(detailPage, /detail-heart|值得重温|值得重听/);
  assert.doesNotMatch(createPage, /值得重温|值得重听|handleRevisitableChange/);
  assert.match(detailPage, /wx:for="\{\{episodePickerEpisodes\}\}"/);
  assert.match(detailLogic, /EPISODE_RANGE_SIZE = 50/);
  assert.match(detailLogic, /episodePickerEpisodes: episodesInRange/);
  assert.match(detailStyles, /\.episode-picker__track\s*\{[^}]*display:\s*inline-flex;/s);
});

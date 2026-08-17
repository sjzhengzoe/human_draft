import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("menu exposes one embedded weekly-menu tab and a searchable selection mode", async () => {
  const [page, logic, config, appConfig] = await Promise.all([
    read("src/pages/menu/index.wxml"),
    read("src/pages/menu/index.ts"),
    read("src/pages/menu/index.json"),
    read("src/app.json"),
  ]);
  assert.match(page, />今日菜单</);
  assert.doesNotMatch(page, />随机菜单</);
  assert.match(page, /class="view-switch"[\s\S]*?>速览<\/view>[\s\S]*?>翻阅<\/view>[\s\S]*?data-mode="plan" bindtap="handleDisplayModeTap" role="tab">今日菜单<\/view>/);
  assert.match(page, /<menu-week-planner wx:elif="\{\{displayMode === 'plan'\}\}" class="week-planner-host"/);
  assert.match(page, /wx:if="\{\{displayMode !== 'plan'\}\}"[\s\S]*?class="menu-section-row"/);
  assert.doesNotMatch(logic, /handleDayPlanTap|pages\/menu\/day-plan\/index/);
  assert.equal(JSON.parse(config).usingComponents?.["menu-week-planner"], "/pages/menu/day-plan/index");
  assert.ok(!JSON.parse(appConfig).subPackages.find((item) => item.root === "pages/menu")?.pages.includes("day-plan/index"));
  assert.doesNotMatch(page, /class="menu-toolbar"/);
  assert.match(page, /class="menu-command-row"[\s\S]*?class="menu-search"[\s\S]*?<app-icon name="search" size="24"[\s\S]*?<app-input[\s\S]*?persistent[\s\S]*?class="menu-command-actions"/);
  assert.match(page, /placeholder="\{\{activeRecordType === 'all' \? '搜索全部菜品或店铺'/);
  assert.match(page, /class="quick-card \{\{item\.selected \? 'quick-card--selected' : ''\}\}"/);
  assert.match(page, /class="favorite-item \{\{item\.selected \? 'favorite-item--selected' : ''\}\}"/);
  assert.match(page, /wx:if="\{\{item\.selected\}\}" class="favorite-item__selected">已选</);
  assert.match(page, /class="selection-basket"/);
  assert.match(page, /<app-dialog[\s\S]*class="basket-grid"[\s\S]*trash-2-danger/);
  assert.match(logic, /query\.mode === "select" \|\| query\.mode === "favorites"/);
  assert.match(logic, /replaceMenuScheduleMeal\(/);
  assert.match(logic, /favorites: this\.data\.favorites\.map\(\(favorite\) => \(\{/);
});

test("weekly-menu selection defaults both dining scene and category to all", async () => {
  const [page, logic] = await Promise.all([
    read("src/pages/menu/index.wxml"),
    read("src/pages/menu/index.ts"),
  ]);
  assert.match(page, /class="record-filter__item \{\{activeRecordType === 'all'/);
  assert.match(page, /activeRecordType === 'home'[\s\S]*data-filter="home"[\s\S]*>全部</);
  assert.match(page, /activeRecordType === 'all'[\s\S]*data-filter="all"[\s\S]*>全部</);
  assert.match(page, /activeRecordType !== 'outside' && dishes\.length/);
  assert.match(page, /activeRecordType !== 'home' && outsidePlaces\.length/);
  assert.match(page, /搜索全部菜品或店铺/);
  const pageData = logic.match(/Page\(\{\s*data:\s*\{([\s\S]*?)\n  \},\n\n  onLoad/)?.[1] || "";
  assert.match(pageData, /activeFilter: "all",\s*activeRecordType: "all"/);
  assert.match(logic, /recordType === "outside"[\s\S]*recordType === "home"[\s\S]*listMenuPlaces/);
  assert.match(page, /class="menu-command-icon menu-command-icon--primary"[\s\S]*?aria-label="新增菜单记录"[\s\S]*?bindtap="handleAddTap"/);
  assert.match(page, /<app-dialog[\s\S]*?visible="\{\{moreMenuVisible\}\}"[\s\S]*?placement="bottom"[\s\S]*?打印菜单[\s\S]*?编辑排序/);
  assert.match(logic, /handleAddTap\(\)[\s\S]*?activeRecordType === "outside"[\s\S]*?pages\/menu\/place-edit\/index[\s\S]*?pages\/menu\/edit\/index/);
});

test("regular menu modes expose all filters and browse home dishes with outside places", async () => {
  const [page, logic] = await Promise.all([
    read("src/pages/menu/index.wxml"),
    read("src/pages/menu/index.ts"),
  ]);
  assert.match(page, /class="record-filter__item \{\{activeRecordType === 'all'/);
  assert.match(page, /wx:if="\{\{activeRecordType === 'home'\}\}" class="category-chip \{\{activeFilter === 'home'/);
  assert.doesNotMatch(page, /wx:if="\{\{selectionMode\}\}" class="record-filter__item/);
  assert.match(logic, /const filter = recordType/);
  assert.match(logic, /canReorder: canWrite && activeRecordType !== "all"/);
  assert.match(logic, /function buildBrowseItems\([\s\S]*?recordType !== "outside"[\s\S]*?recordType !== "home"/);
  assert.match(logic, /browseItems: buildBrowseItems\(matchedDishes, matchedPlaces, recordType, 0\)/);
  assert.match(page, /wx:for="\{\{browseItems\}\}"[\s\S]*?browseItem\.kind === 'place'[\s\S]*?dishes\[browseItem\.itemIndex\]\.name/);
});

test("weekly menu component keeps focused day and week displays with the random flow", async () => {
  const [page, logic, style, config] = await Promise.all([
    read("src/pages/menu/day-plan/index.wxml"),
    read("src/pages/menu/day-plan/index.ts"),
    read("src/pages/menu/day-plan/index.less"),
    read("src/pages/menu/day-plan/index.json"),
  ]);
  assert.doesNotMatch(page, /custom-navigation/);
  assert.match(page, /class="menu-week-planner"/);
  assert.doesNotMatch(page, /class="planner-shell"|class="planner-navigation"/);
  assert.doesNotMatch(page, /class="fullscreen-loading"/);
  assert.match(page, /class="planner-header"[\s\S]*?loading && !hasLoaded[\s\S]*?class="planner-initial-loading content-loading"/);
  assert.match(page, /class="planner-header"[\s\S]*class="planner-content"/);
  assert.match(page, /bounces="\{\{false\}\}"/);
  assert.match(page, /\['day', 'week'\]/);
  assert.doesNotMatch(page, /activeMode === 'month'|class="year-grid"/);
  assert.match(page, />随机点菜</);
  assert.match(page, /class="planner-toolbar planner-toolbar--spread"[\s\S]*?class="time-tabs"[\s\S]*?class="planner-toolbar__actions"[\s\S]*?class="random-action random-action--primary"[\s\S]*?class="ranking-button"/);
  assert.doesNotMatch(page, /class="period-navigation"/);
  assert.doesNotMatch(page, /class="period-bar"/);
  assert.doesNotMatch(page, /class="random-header"/);
  assert.match(page, /activeMode === 'week'/);
  assert.match(page, /class="week-rail"[\s\S]*?wx:for="\{\{activeMode === 'week' \? weekRailItems : dayRailItems\}\}"[\s\S]*?data-direction="\{\{item\.direction\}\}"[\s\S]*?bindtap="handlePeriodMove"/);
  assert.match(page, /class="week-rail__visual"[\s\S]*?class="week-rail__label"[\s\S]*?class="week-rail__range"/);
  assert.match(page, /class="week-table"[\s\S]*?class="week-matrix week-matrix--header"[\s\S]*?<scroll-view class="week-table__content"[\s\S]*?class="week-matrix week-matrix--body"/);
  assert.match(page, /class="week-matrix__thumbnail"/);
  assert.match(page, /class="week-matrix__thumbnail"[^>]*mode="aspectFit"/);
  assert.match(page, /wx:for="\{\{meal\.items\}\}"/);
  assert.match(page, /week-matrix__cell--empty/);
  assert.doesNotMatch(page, /week-meal__summary/);
  assert.doesNotMatch(logic, /addMonths|addYears|toMonthCells|toYearMonths|handleMonthDayTap|handleYearMonthTap/);
  assert.match(page, /bindtap="handleRanking"/);
  assert.match(page, /wx:for="\{\{meal\.items\}\}"/);
  assert.match(page, /class="meal-slot meal-slot--add"[\s\S]*?bindtap="handleMealEdit"/);
  assert.match(page, /class="meal-slot__remove"[\s\S]*?catchtap="handleRemoveMealItem"/);
  assert.match(page, /class="meal-slot__remove"[\s\S]*?<app-icon name="x-muted" size="18"/);
  assert.match(page, /class="meal-slot__image"[^>]*mode="aspectFit"[^>]*fade-in="\{\{false\}\}"/);
  assert.doesNotMatch(page, /meal-list__line|meal-section__marker/);
  assert.match(page, /class="meal-section__count">\{\{meal\.items\.length \? meal\.items\.length \+ ' 道' : '未安排'\}\}/);
  assert.doesNotMatch(page, /operation-loading/);
  assert.doesNotMatch(page, /空档位|handleAddSlot|handleRemoveSlotRequest|showRemoveDialog/);
  assert.doesNotMatch(page, /全部解锁|handleResetLocks|meal-slot--locked|已锁/);
  assert.match(logic, /items: toPlanItems\(meal\?\.items \|\| \[\], date, definition\.key\)/);
  assert.match(logic, /function scheduleItemKey\(item: MenuScheduleItem[\s\S]*?item\.source_kind === "dish" \? item\.dish_id : item\.place_id/);
  assert.match(logic, /key: scheduleItemKey\(item, date, period, index\)/);
  assert.match(logic, /Component\(\{/);
  assert.match(logic, /lifetimes:\s*\{[\s\S]*?attached\(\)[\s\S]*?detached\(\)/);
  assert.match(logic, /pageLifetimes:\s*\{[\s\S]*?show\(\)/);
  assert.match(logic, /function toWeekRailItems\(anchor: string\): WeekRailItem\[\]/);
  assert.match(logic, /function toDayRailItems\(anchor: string\): WeekRailItem\[\]/);
  assert.match(logic, /dayRailItems: toDayRailItems\(selectedDate\)/);
  assert.match(logic, /weekRailItems: toWeekRailItems\(selectedDate\)/);
  assert.match(logic, /if \(rawDirection === 0\) return/);
  assert.match(logic, /randomAdditionCount = DEFAULT_RANDOM_ITEM_COUNT - meal\.items\.length/);
  assert.match(logic, /items: \[\.\.\.meal\.items, \.\.\.additions\]/);
  assert.match(logic, /meal\.items\.length >= DEFAULT_RANDOM_ITEM_COUNT/);
  assert.match(logic, /handleRemoveMealItem/);
  assert.match(logic, /applyScheduleSilently/);
  assert.match(logic, /dayMeals\[\$\{mealIndex\}\]\.items/);
  assert.doesNotMatch(logic, /if \(!this\.restoreScheduleFromStore\(\)\) await this\.loadSchedule\(\)/);
  assert.match(logic, /restoreScheduleFromStore/);
  assert.match(logic, /if \(showInitialLoading\) this\.setData\(\{ errorMessage: message \}\)[\s\S]*?wx\.showToast/);
  assert.doesNotMatch(logic, /slotCount|slot_count|locked|handleMealItemTap|handleResetLocks/);
  assert.match(logic, /imageUrl: item\.image_url \|\| item\.place_image_url/);
  assert.match(style, /:host \{[^}]*height: 100%/);
  assert.match(style, /\.menu-week-planner \{[^}]*height: 100%[^}]*overflow: hidden/);
  assert.match(style, /\.planner-page \{[^}]*height: 100%[^}]*flex: 1/);
  assert.match(style, /\.planner-content \{[^}]*flex: 1/);
  assert.match(style, /\.ranking-button \{[^}]*background: var\(--ui-color-action-primary\)[^}]*color: var\(--ui-color-text-inverse\)/);
  assert.match(style, /\.meal-slot__image-wrap \{[^}]*aspect-ratio: 4 \/ 3/);
  assert.match(style, /\.meal-section \{[^}]*flex-direction: column/);
  assert.match(style, /\.meal-section \{[^}]*border-bottom: 1rpx solid var\(--ui-color-border\)/);
  assert.match(style, /\.meal-section--last \{[^}]*border-bottom: 0/);
  assert.match(style, /\.meal-list \{[^}]*flex-direction: column[^}]*gap: 26rpx/);
  assert.match(style, /\.meal-section__header \{[^}]*min-height: 42rpx[^}]*margin-bottom: -10rpx/);
  assert.doesNotMatch(style, /\.meal-section__header \{[^}]*background:/);
  assert.doesNotMatch(style, /\.meal-list__line|\.meal-section__marker/);
  assert.match(style, /\.meal-section__title \{[^}]*color: var\(--ui-color-text-primary\)[^}]*font-size: var\(--ui-font-size-large\)[^}]*font-weight: 750/);
  assert.match(style, /\.meal-slot \{[^}]*width: 176rpx[^}]*height: 194rpx/);
  assert.match(style, /\.meal-slot--add \{[^}]*width: 176rpx[^}]*height: 194rpx/);
  assert.match(style, /\.meal-slot__remove \{[^}]*top: -28rpx[^}]*right: -28rpx[^}]*width: 56rpx[^}]*height: 56rpx/);
  assert.match(style, /\.meal-slot__remove-visual \{[^}]*width: 38rpx[^}]*height: 38rpx[^}]*border-radius: 50%[^}]*background: var\(--ui-color-background-subtle\)/);
  assert.match(style, /\.week-matrix__cell--filled \{[^}]*border-color: var\(--ui-color-border\)[^}]*background: var\(--ui-color-background-surface\)[^}]*color: var\(--ui-color-text-primary\)/);
  assert.match(style, /\.week-table \{[^}]*height: 0[^}]*flex: 1[^}]*flex-direction: column/);
  assert.match(style, /\.week-table__content \{[^}]*height: 0[^}]*flex: 1/);
  assert.doesNotMatch(style, /\.week-matrix__header \{[^}]*(?:position: sticky|position: fixed)/);
  assert.match(style, /\.week-rail \{[^}]*grid-template-columns: 1fr 1\.16fr 1fr[^}]*margin-top: 16rpx/);
  assert.match(style, /\.week-rail__item \{[^}]*min-height: 88rpx/);
  assert.match(style, /\.week-rail__visual \{[^}]*min-height: 80rpx[^}]*background: var\(--ui-color-background-surface\)/);
  assert.match(style, /\.week-rail__item--selected \.week-rail__visual \{[^}]*background: var\(--ui-color-action-primary\)[^}]*color: var\(--ui-color-text-inverse\)/);
  assert.match(style, /\.week-matrix__row \{[^}]*min-height: 146rpx/);
  assert.match(style, /\.week-matrix__cell \{[^}]*min-height: 130rpx[^}]*gap: 6rpx[^}]*padding: 8rpx/);
  assert.match(style, /\.week-matrix__item-name \{[^}]*font-size: var\(--ui-font-size-small\)[^}]*text-overflow: ellipsis[^}]*white-space: nowrap/);
  assert.doesNotMatch(style, /\.week-matrix__cell--filled \{[^}]*background: var\(--ui-color-action-primary\)/);
  assert.doesNotMatch(style, /\.page-scroll \{[^}]*height: 100vh/);
  const pageConfig = JSON.parse(config);
  assert.equal(pageConfig.component, true);
  assert.equal(pageConfig.styleIsolation, "apply-shared");
  assert.equal(pageConfig.disableScroll, undefined);
  assert.equal(pageConfig.usingComponents?.["operation-loading"], undefined);
});

test("ranking mixes dishes and stores while the server caps statistics at today", async () => {
  const [page, logic] = await Promise.all([
    read("src/pages/menu/ranking/index.wxml"),
    read("server/domains/menu/schedule.mjs"),
  ]);
  assert.match(page, /item\.type === 'place' \? '店铺' : '菜品'/);
  assert.doesNotMatch(page, /菜品排行|店铺排行/);
  assert.match(logic, /const effectiveEnd = range\.end < today \? range\.end : today/);
  assert.match(logic, /seenInMeal\.has\(key\)/);
  assert.match(logic, /item\.record_type === "outside" \|\| item\.source_kind === "place"/);
});

test("menu schedule persistence stores selected items without a slot limit", async () => {
  const [pageLogic, service, types, domain, migration] = await Promise.all([
    read("src/pages/menu/index.ts"),
    read("src/services/menu.ts"),
    read("src/types/api.ts"),
    read("server/domains/menu/schedule.mjs"),
    read("supabase/migrations/20260817034505_make_menu_schedule_item_count_dynamic.sql"),
  ]);

  assert.doesNotMatch(pageLogic, /selectionSlotCount|slotCount:/);
  assert.doesNotMatch(service, /slot_count: input\.slotCount/);
  assert.doesNotMatch(types, /MenuScheduleMeal[\s\S]*?slot_count/);
  assert.doesNotMatch(domain, /INVALID_SLOT_COUNT|p_slot_count|items\.length <= slotCount/);
  assert.match(domain, /normalizeScheduleItems\(body\.items\)/);
  assert.match(migration, /drop column if exists slot_count/);
  assert.match(migration, /drop function if exists public\.replace_menu_schedule_meal\(text, date, text, integer, jsonb\)/);
  assert.match(migration, /create or replace function public\.replace_menu_schedule_meal\([\s\S]*?p_items jsonb/);
  assert.match(migration, /MENU_SCHEDULE_ITEM_COUNT_INVALID/);
});

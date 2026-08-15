import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("menu exposes one shared weekly-menu entry and a searchable selection mode", async () => {
  const [page, logic] = await Promise.all([
    read("src/pages/menu/index.wxml"),
    read("src/pages/menu/index.ts"),
  ]);
  assert.match(page, />本周菜单</);
  assert.doesNotMatch(page, />随机菜单</);
  assert.match(page, /wx:if="\{\{displayMode === 'quick' && !selectionMode\}\}" class="menu-toolbar"/);
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
  assert.match(logic, /activeFilter: "all",\s*activeRecordType: "all"/);
  assert.match(logic, /recordType === "outside"[\s\S]*recordType === "home"[\s\S]*listMenuPlaces/);
  assert.match(page, /<button wx:if="\{\{canWrite \|\| guestMode\}\}" class="add-button" bindtap="handleAddTap">/);
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

test("weekly menu has day, week, month, year displays and embeds the original random flow", async () => {
  const [page, logic, style, config] = await Promise.all([
    read("src/pages/menu/day-plan/index.wxml"),
    read("src/pages/menu/day-plan/index.ts"),
    read("src/pages/menu/day-plan/index.less"),
    read("src/pages/menu/day-plan/index.json"),
  ]);
  assert.match(page, /custom-navigation title="本周菜单"/);
  assert.match(page, /class="planner-shell"/);
  assert.match(page, /class="planner-navigation"[\s\S]*class="planner-page"/);
  assert.match(page, /class="planner-header"[\s\S]*class="planner-content"/);
  assert.match(page, /bounces="\{\{false\}\}"/);
  assert.match(page, /\['day', 'week', 'month', 'year'\]/);
  assert.match(page, />随机菜单</);
  assert.match(page, /activeMode === 'week'/);
  assert.match(page, /class="week-matrix"/);
  assert.match(page, /class="week-matrix__thumbnail"/);
  assert.match(page, /wx:for="\{\{meal\.items\}\}"/);
  assert.match(page, /week-matrix__cell--empty/);
  assert.doesNotMatch(page, /week-meal__summary/);
  assert.match(page, /activeMode === 'month'/);
  assert.match(page, /class="year-grid"/);
  assert.match(page, /bindtap="handleRanking"/);
  assert.match(logic, /slot_count \|\| DEFAULT_SLOT_COUNT/);
  assert.match(logic, /imageUrl: item\.image_url \|\| item\.place_image_url/);
  assert.match(logic, /if \(slot\.locked && slot\.item\)/);
  assert.match(style, /\.planner-shell \{[^}]*height: 100vh[^}]*overflow: hidden/);
  assert.match(style, /\.planner-page \{[^}]*height: 0[^}]*flex: 1/);
  assert.match(style, /\.planner-content \{[^}]*flex: 1/);
  assert.doesNotMatch(style, /\.page-scroll \{[^}]*height: 100vh/);
  assert.equal(JSON.parse(config).disableScroll, true);
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

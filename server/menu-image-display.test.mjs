import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("menu uploads one 3:2 crop and keeps browse cards top-aligned", async () => {
  const [page, styles, menuPage, menuStyles, menuLogic, cropper] = await Promise.all([
    readFile(new URL("../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.less", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="image-field__preview"[\s\S]*?mode="aspectFit"/);
  assert.match(page, /shape="rectangle"/);
  assert.match(page, /aspect-ratio="1\.5"/);
  assert.match(page, /output-size="1536"/);
  assert.match(styles, /\.image-field[^}]*aspect-ratio:\s*3\s*\/\s*2/);
  assert.match(menuPage, /displayMode === 'quick'/);
  assert.match(menuPage, /displayMode === 'browse'/);
  assert.doesNotMatch(menuPage, /当前 \{\{dishes\.length\}\} 个选择/);
  assert.doesNotMatch(menuPage, /data-type="all"/);
  assert.doesNotMatch(menuPage, />全部<\/view>/);
  assert.doesNotMatch(menuPage, /quick-card__type/);
  assert.doesNotMatch(menuPage, /quick-card__meals/);
  assert.doesNotMatch(menuPage, /quick-card__category/);
  assert.match(menuPage, /<swiper[\s\S]*class="browse-swiper"/);
  assert.match(menuPage, /<swiper-item/);
  assert.match(menuPage, /bindchange="handleBrowseChange"/);
  assert.doesNotMatch(menuPage, /previous-margin|next-margin/);
  assert.match(menuPage, /display-multiple-items="1"/);
  assert.match(menuPage, /acceleration="\{\{false\}\}"/);
  assert.match(menuPage, /duration="160"/);
  assert.match(menuPage, /class="browse-card"[\s\S]*bindtap="handleEditDishTap"/);
  assert.doesNotMatch(menuPage, /browse-card__edit|handleDishImageTap/);
  assert.match(
    menuPage,
    /browse-card__name[\s\S]*browse-card__title-introduction[\s\S]*browse-card__record-row[\s\S]*记录类型[\s\S]*分类[\s\S]*browse-card__meal-row[\s\S]*主要食材[\s\S]*烹饪方式[\s\S]*口味[\s\S]*衍生菜系/,
  );
  assert.match(menuPage, /wx:if="\{\{item\.record_type === 'home' && item\.introduction\}\}"/);
  assert.match(menuStyles, /\.browse-card__record-row[^}]*border-top:\s*1rpx solid #e8e8e8/);
  assert.match(menuPage, /class="browse-slide-scroll"[\s\S]*scroll-y/);
  assert.doesNotMatch(menuPage, /handleBrowseScroll/);
  assert.doesNotMatch(menuPage, /scroll-into-view/);
  assert.match(menuPage, /scroll-y/);
  assert.doesNotMatch(menuPage, /左右滑动/);
  assert.doesNotMatch(menuPage, /browse-card__index/);
  assert.match(menuPage, /mode="aspectFit"/);
  assert.match(menuStyles, /\.dish-image-frame[^}]*padding-top:\s*100%/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*width:\s*452rpx/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*margin:\s*0 auto/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*padding-top:\s*452rpx/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*border-radius:\s*50%/);
  assert.match(menuStyles, /\.browse-carousel[^}]*justify-content:\s*flex-start/);
  assert.match(menuStyles, /\.browse-carousel[^}]*padding:\s*26rpx 0/);
  assert.match(menuStyles, /\.browse-slide-scroll[^}]*height:\s*100%/);
  assert.match(menuStyles, /\.browse-card[^}]*width:\s*560rpx/);
  assert.match(menuStyles, /\.browse-card[^}]*margin:\s*0 auto/);
  assert.match(menuStyles, /\.browse-card[^}]*padding:\s*24rpx/);
  assert.match(menuStyles, /\.browse-card__black-tag[^}]*background:\s*var\(--ui-surface\)/);
  assert.match(menuStyles, /\.browse-card__black-tag[^}]*color:\s*#111/);
  assert.match(menuStyles, /\.quick-grid[^}]*grid-template-columns:\s*repeat\(3/);
  assert.match(menuStyles, /\.quick-card[^}]*border-radius:\s*34rpx/);
  assert.match(menuStyles, /\.quick-card[^}]*padding:\s*0/);
  assert.match(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*border-radius:\s*33rpx 33rpx 0 0/);
  assert.doesNotMatch(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*transform:\s*scale/);
  assert.match(menuStyles, /\.quick-card__name[^}]*text-align:\s*center/);
  assert.match(menuStyles, /\.browse-swiper[^}]*background:\s*var\(--ui-page-background\)/);
  assert.match(menuStyles, /\.record-filter__item--active[^}]*border-color:\s*#111/);
  assert.match(menuStyles, /\.category-chip--active[^}]*border-color:\s*#111/);
  assert.match(menuLogic, /resolveCategoryFilter/);
  assert.match(menuLogic, /activeFilter,\s*activeRecordType,/);
  assert.match(menuLogic, /handleBrowseChange\(event:\s*WechatMiniprogram\.SwiperChange\)/);
  assert.doesNotMatch(menuLogic, /getBrowseMetrics|BROWSE_CARD_STRIDE_RPX|scrollLeft/);
  assert.match(cropper, /viewportWidth/);
  assert.match(cropper, /viewportHeight/);
  assert.match(cropper, /canvas\.height = outputHeight/);
});

test("menu client supplies safe defaults when older APIs omit new dish fields", async () => {
  const service = await readFile(
    new URL("../src/services/menu.ts", import.meta.url),
    "utf8",
  );

  assert.match(service, /function normalizeDish\(dish: Dish\): Dish/);
  assert.match(service, /main_ingredients: normalizeStringArray\(dish\.main_ingredients\)/);
  assert.match(service, /cooking_methods: normalizeStringArray\(dish\.cooking_methods\)/);
  assert.match(service, /flavor_options: normalizeStringArray\(dish\.flavor_options\)/);
  assert.match(service, /mealPeriods\.length > 0 \? mealPeriods : \[\.\.\.DEFAULT_MEAL_PERIODS\]/);
  assert.match(service, /data\.items\.map\(normalizeDish\)/);
  assert.match(service, /return normalizeDish\(data\.dish\)/);
});

test("menu edit page locks native scrolling and scrolls its content area", async () => {
  const [pageConfig, page] = await Promise.all([
    readFile(new URL("../src/pages/menu/edit/index.json", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pageConfig).disableScroll, true);
  assert.match(page, /<scroll-view[\s\S]*class="edit-scroll page--fixed"[\s\S]*scroll-y/);
  assert.match(page, /show-scrollbar="\{\{false\}\}"/);
});

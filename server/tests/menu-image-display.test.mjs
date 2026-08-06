import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("menu supports 4:3 dish images, 1:1 store images, and matching previews", async () => {
  const [page, styles, editLogic, menuPage, menuStyles, menuLogic, menuService, diningService, menuRevision, menuPlaces, menuOverview, cropper, attributes, placePage, placeStyles, placeEdit, placeEditStyles] = await Promise.all([
    readFile(new URL("../../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/edit/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/edit/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/menu.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/dining.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/menu-data-revision.ts", import.meta.url), "utf8"),
    readFile(new URL("../domains/menu/places.mjs", import.meta.url), "utf8"),
    readFile(new URL("../domains/menu/overview.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/image-cropper/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/menu-attributes.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/place/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/place/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/place-edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/place-edit/index.less", import.meta.url), "utf8"),
  ]);

  assert.match(page, /class="image-field__preview"[\s\S]*?mode="aspectFill"/);
  assert.match(page, /拍照或从相册选择/);
  assert.match(page, /外食菜品可暂不添加/);
  assert.match(page, /所属店铺/);
  assert.match(page, /<app-dialog[\s\S]*title="删除菜品"/);
  assert.doesNotMatch(page, /record-overview/);
  assert.match(
    page,
    /菜品名称[\s\S]*菜品介绍[\s\S]*用餐场景[\s\S]*菜品分类[\s\S]*适用餐次[\s\S]*主要食材[\s\S]*烹饪类型[\s\S]*口味特点[\s\S]*衍生菜系/,
  );
  assert.match(page, /菜品名称<text class="field__required">\*<\/text>/);
  assert.match(page, /field field--inline field--name/);
  assert.match(page, /field field--inline field--introduction/);
  assert.match(page, /<app-input[\s\S]*?custom-class="field__input"[\s\S]*?value="\{\{name\}\}"[\s\S]*?placeholder="例如：番茄炒鸡蛋"/);
  assert.match(page, /field--introduction[\s\S]*?<app-input[\s\S]*?value="\{\{introduction\}\}"[\s\S]*?placeholder="简单介绍这道菜"/);
  assert.equal(page.match(/<app-input\b/g)?.length, 4);
  assert.equal(page.match(/font-size="23rpx"/g)?.length, 4);
  assert.doesNotMatch(page, /<input\b|always-embed/);
  assert.match(page, /用餐场景<text class="field__required">\*<\/text>/);
  assert.match(page, /适用餐次<text class="field__required">\*<\/text>/);
  assert.doesNotMatch(page, /可不填/);
  assert.match(page, /bindtap="handleCookingMethodTap"/);
  assert.match(page, /bindtap="handleTasteTap"/);
  assert.match(page, /aria-label="菜品分类"/);
  assert.match(page, /bindtap="handleCategoryTap"/);
  assert.match(page, /index === categoryIndex \? 'meal-period-option--selected' : ''/);
  assert.match(page, /菜品分类<text class="field__required">\*<\/text>/);
  assert.doesNotMatch(page, /暂不分类/);
  assert.doesNotMatch(page, /<picker[^>]*bindchange="handleCategoryChange"/);
  assert.match(page, /value="\{\{mainIngredientInput\}\}"/);
  assert.match(page, /placeholder="输入食材，例如：虾仁"/);
  assert.match(page, /bindconfirm="handleAddMainIngredient"/);
  assert.match(page, /wx:for="\{\{mainIngredients\}\}"/);
  assert.match(page, /field field--inline field--section-start[\s\S]*?主要食材[\s\S]*?item-field__content/);
  assert.match(page, /wx:if="\{\{mainIngredients\.length\}\}"[\s\S]*?class="item-entry"[\s\S]*?mainIngredientInput/);
  assert.match(page, /catchtap="handleRemoveMainIngredient"/);
  assert.doesNotMatch(page, /主要食材（可不填，每行一个）/);
  assert.match(page, /field--introduction[\s\S]*?<app-input[\s\S]*?value="\{\{introduction\}\}"/);
  assert.doesNotMatch(page, /<textarea[\s\S]*?value="\{\{introduction\}\}"/);
  assert.match(page, /value="\{\{flavorOptionInput\}\}"/);
  assert.match(page, /placeholder="输入衍生菜，例如：紫苏炒虾"/);
  assert.match(page, /bindconfirm="handleAddFlavorOption"/);
  assert.match(page, /wx:for="\{\{flavorOptions\}\}"/);
  assert.match(page, /field field--inline[\s\S]*?衍生菜系[\s\S]*?item-field__content/);
  assert.match(page, /wx:if="\{\{flavorOptions\.length\}\}"[\s\S]*?class="item-entry"[\s\S]*?flavorOptionInput/);
  assert.match(page, /catchtap="handleRemoveFlavorOption"/);
  assert.doesNotMatch(page, /衍生菜系（可不填，每行一个）/);
  assert.doesNotMatch(page, /bindinput="handleCookingMethodsInput"/);
  assert.doesNotMatch(page, /bindinput="handleTasteInput"/);
  assert.match(page, /shape="rectangle"/);
  assert.match(page, /aspect-ratio="1\.333333"/);
  assert.match(page, /output-size="1536"/);
  assert.match(styles, /\.image-field[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(styles, /\.field--inline[^}]*grid-template-columns:\s*132rpx minmax\(0, 1fr\)/);
  assert.match(styles, /\.field--inline[^}]*padding:\s*22rpx 28rpx/);
  assert.match(styles, /\.field--inline\.field--section-start[^}]*padding-top:\s*24rpx[^}]*border-top:\s*1rpx solid #e8e8e8/);
  assert.match(styles, /\.field--inline\.field--name,[\s\S]*?\.field--inline\.field--introduction[^}]*align-items:\s*center/);
  assert.match(styles, /\.field--name \.field__label,[\s\S]*?\.field--introduction \.field__label[^}]*padding-top:\s*0/);
  assert.match(styles, /\.field__label[^}]*font-size:\s*23rpx/);
  assert.match(styles, /\.meal-period-option[^}]*font-size:\s*23rpx/);
  assert.match(styles, /\.field__input[^}]*border-bottom:\s*1rpx solid #dedede[^}]*background:\s*transparent/);
  assert.match(styles, /\.item-entry[^}]*border-bottom:\s*1rpx solid #dedede[^}]*background:\s*transparent/);
  assert.match(styles, /\.item-entry__input[^}]*border:\s*0[^}]*background:\s*transparent/);
  assert.match(styles, /\.field__input,[\s\S]*?\.item-entry__input[^}]*font-family:[^}]*HumanDraftUI/);
  assert.match(styles, /\.field__input[^}]*font-size:\s*23rpx/);
  assert.match(styles, /\.item-entry__input[^}]*font-size:\s*23rpx/);
  assert.match(styles, /\.choice-option--selected,[\s\S]*background:\s*var\(--ui-surface\)/);
  assert.match(styles, /\.choice-option--selected,[\s\S]*color:\s*#111/);
  assert.match(editLogic, /sourceType:\s*\["album", "camera"\]/);
  assert.match(editLogic, /initializeUIFont\(\)\.catch\(\(\) => undefined\)/);
  assert.match(editLogic, /COOKING_TYPE_OPTIONS/);
  assert.match(editLogic, /normalizeCookingTypes\(dish\.cooking_methods\)/);
  assert.match(editLogic, /normalizeTasteTags\(dish\.taste\)/);
  assert.match(editLogic, /handleCookingMethodTap\(event:/);
  assert.match(editLogic, /handleTasteTap\(event:/);
  assert.match(editLogic, /handleCategoryTap\(event:/);
  assert.doesNotMatch(editLogic, /editingTextField|handleTextFieldEdit|handleTextFieldBlur/);
  assert.match(editLogic, /categoryIndex:\s*-1/);
  assert.match(editLogic, /if \(recordType === "home" && !category\) \{/);
  assert.doesNotMatch(editLogic, /categoryOffset/);
  assert.doesNotMatch(editLogic, /暂不分类/);
  assert.match(editLogic, /handleAddMainIngredient\(\)/);
  assert.match(editLogic, /handleRemoveMainIngredient\(event:/);
  assert.match(editLogic, /handleAddFlavorOption\(\)/);
  assert.match(editLogic, /handleRemoveFlavorOption\(event:/);
  assert.match(editLogic, /tasteOptions[\s\S]*filter\(\(option\) => option\.selected\)[\s\S]*join\("、"\)/);
  assert.match(editLogic, /cookingMethodOptions[\s\S]*filter\(\(option\) => option\.selected\)/);
  assert.match(attributes, /COOKING_TYPE_OPTIONS = \["煎炒", "蒸煮", "凉拌", "烤炸", "即食"\]/);
  assert.match(attributes, /TASTE_OPTIONS = \["清淡", "咸", "鲜", "香", "酸", "甜", "辣"\]/);
  assert.match(attributes, /COOKING_TYPE_OPTIONS\.includes\(value\)/);
  assert.doesNotMatch(attributes, /\[煎炒爆煸\]/);
  assert.match(attributes, /TASTE_OPTIONS\.includes\(item\)/);
  assert.doesNotMatch(attributes, /item\.includes\("香"\)/);
  assert.match(menuPage, /displayMode === 'quick'/);
  assert.match(menuPage, /displayMode === 'browse'/);
  assert.match(
    menuPage,
    /wx:if="\{\{!contentLoading && !errorMessage && \(activeRecordType === 'home' \? dishes\.length > 0 : outsidePlaces\.length > 0\)\}\}" class="quick-footer">没有更多了/,
  );
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
    /browse-card__name[\s\S]*browse-card__title-introduction[\s\S]*browse-card__record-row[\s\S]*用餐场景[\s\S]*菜品分类[\s\S]*browse-card__meal-row[\s\S]*主要食材[\s\S]*烹饪类型[\s\S]*口味特点[\s\S]*衍生菜系/,
  );
  assert.match(menuPage, /wx:for="\{\{item\.tasteTags\}\}"/);
  assert.match(menuPage, /menu-filter-label">用餐场景：/);
  assert.match(menuPage, /activeRecordType === 'outside' \? '外食分类：' : '菜品分类：'/);
  assert.match(menuPage, /wx:if="\{\{item\.introduction\}\}"/);
  assert.match(menuPage, /wx:for="\{\{outsidePlaces\}\}"/);
  assert.match(menuPage, /bindtap="handlePlaceTap"/);
  assert.match(menuPage, /wx:for="\{\{place\.dishes\}\}"/);
  assert.match(menuPage, /class="outside-store__dish-scroll"[\s\S]*scroll-x/);
  assert.match(menuPage, /class="outside-store__dish-grid"/);
  assert.match(menuPage, /data-id="\{\{dish\.id\}\}" bindtap="handleDishTap"/);
  assert.match(menuPage, /店内菜品/);
  assert.match(placePage, /class="store-hero"/);
  assert.match(placePage, /新增菜品/);
  assert.match(placePage, /store-action store-action--secondary outline-action[\s\S]*app-icon name="pencil"/);
  assert.match(placePage, /store-action store-action--primary add-dish-button[\s\S]*app-icon name="plus-white"/);
  assert.match(placePage, /class="store-hero__image-frame"[\s\S]*class="store-hero__image"/);
  assert.match(placeStyles, /\.store-hero__image-frame[^}]*height:\s*0[^}]*padding-top:\s*100%/);
  assert.match(placeStyles, /\.store-hero__image,[\s\S]*?\.store-hero__empty[^}]*width:\s*100%[^}]*height:\s*100%/);
  assert.match(placeStyles, /\.store-action[^}]*width:\s*auto !important[^}]*min-width:\s*0 !important[^}]*height:\s*58rpx/);
  assert.match(placeStyles, /\.store-action--primary[^}]*background:\s*#111/);
  assert.match(placeStyles, /\.store-action--secondary[^}]*background:\s*var\(--ui-surface\)/);
  assert.match(placeEdit, /<app-dialog[\s\S]*title="删除店铺"/);
  assert.match(placeEdit, /shape="square"[\s\S]*aspect-ratio="1"[\s\S]*output-size="1080"/);
  assert.match(placeEdit, /bindtap="handleAddDish">保存并新增菜品/);
  assert.match(placeEditStyles, /\.image-field[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(menuStyles, /\.browse-card__record-row[^}]*border-top:\s*1rpx solid #e8e8e8/);
  assert.match(menuPage, /class="browse-slide-scroll"[\s\S]*scroll-y/);
  assert.doesNotMatch(menuPage, /handleBrowseScroll/);
  assert.doesNotMatch(menuPage, /scroll-into-view/);
  assert.match(menuPage, /scroll-y/);
  assert.doesNotMatch(menuPage, /左右滑动/);
  assert.doesNotMatch(menuPage, /browse-card__index/);
  assert.doesNotMatch(menuPage, /mode="aspectFit"/);
  assert.match(menuStyles, /\.dish-image-frame[^}]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(menuPage, /class="dish-image-frame browse-card__image-frame"[\s\S]*?mode="aspectFill"/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*width:\s*480rpx/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*height:\s*360rpx/);
  assert.match(menuStyles, /\.store-browse-card \.browse-card__image-frame[^}]*height:\s*480rpx[^}]*aspect-ratio:\s*1\s*\/\s*1/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*margin:\s*0 auto/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*padding-top:\s*0/);
  assert.match(menuStyles, /\.browse-card__image-frame[^}]*border-radius:\s*16rpx/);
  assert.match(menuStyles, /\.browse-card__body[^}]*padding:\s*30rpx 16rpx 6rpx/);
  assert.match(menuStyles, /\.browse-carousel[^}]*justify-content:\s*flex-start/);
  assert.match(menuStyles, /\.browse-carousel[^}]*padding:\s*26rpx 0/);
  assert.match(menuStyles, /\.browse-slide-scroll[^}]*height:\s*100%/);
  assert.match(menuStyles, /\.browse-card[^}]*width:\s*560rpx/);
  assert.match(menuStyles, /\.browse-card[^}]*margin:\s*0 auto/);
  assert.match(menuStyles, /\.browse-card[^}]*padding:\s*40rpx 24rpx 24rpx/);
  assert.match(menuStyles, /\.browse-card__black-tag[^}]*background:\s*var\(--ui-surface\)/);
  assert.match(menuStyles, /\.browse-card__black-tag[^}]*color:\s*#111/);
  assert.match(menuStyles, /\.browse-card__black-tag[^}]*border:\s*2rpx solid #d4d4d4/);
  assert.match(menuStyles, /\.quick-grid[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(
    menuStyles,
    /\.content-scroll--quick[^}]*padding:\s*var\(--ui-page-gutter\) var\(--ui-page-gutter\)/,
  );
  assert.match(menuStyles, /\.quick-card[^}]*border-radius:\s*24rpx/);
  assert.match(menuStyles, /\.quick-card[^}]*padding:\s*0/);
  assert.match(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*border-radius:\s*23rpx 23rpx 0 0/);
  assert.doesNotMatch(menuStyles, /\.quick-card__image-frame \.dish-image[^}]*transform:\s*scale/);
  assert.match(menuStyles, /\.quick-card__name[^}]*text-align:\s*left/);
  assert.match(menuStyles, /\.browse-swiper[^}]*background:\s*var\(--ui-page-background\)/);
  assert.match(menuStyles, /\.record-filter__item--active[^}]*border-color:\s*#111/);
  assert.match(menuStyles, /\.category-chip--active[^}]*border-color:\s*#111/);
  assert.match(menuLogic, /resolveCategoryFilter/);
  assert.match(menuLogic, /activeFilter,\s*activeRecordType,/);
  assert.match(menuLogic, /const overview = await getMenuOverview/);
  assert.match(menuService, /\/api\/menu-overview/);
  assert.match(menuService, /error instanceof ApiRequestError && error\.statusCode === 404/);
  assert.match(menuService, /return getLegacyMenuOverview\(params\)/);
  assert.match(menuOverview, /Promise\.all\(\[\s*listCategories/);
  assert.match(menuOverview, /include_dishes: false/);
  assert.match(menuService, /include_dishes\?: boolean/);
  assert.match(menuPlaces, /if \(!includeDishes\) \{\s*return places\.map/);
  assert.match(menuLogic, /metadataLoaded:\s*false/);
  assert.match(menuLogic, /menuContentCache = new Map/);
  assert.match(menuLogic, /revisionChanged[\s\S]*cacheExpired/);
  assert.match(menuLogic, /this\.refreshData\(false, true\)/);
  assert.match(menuService, /markMenuDataChanged\(\)/);
  assert.match(diningService, /markMenuDataChanged\(\)/);
  assert.match(menuRevision, /menuDataRevision \+= 1/);
  assert.match(menuLogic, /applyBrowseWindow/);
  assert.match(menuLogic, /BROWSE_WINDOW_RADIUS\s*=\s*1/);
  assert.match(menuPage, /wx:if="\{\{item\.browseVisible\}\}" class="browse-slide-scroll"/);
  assert.match(menuLogic, /handleBrowseChange\(event:\s*WechatMiniprogram\.SwiperChange\)/);
  assert.doesNotMatch(menuLogic, /getBrowseMetrics|BROWSE_CARD_STRIDE_RPX|scrollLeft/);
  assert.match(cropper, /viewportWidth/);
  assert.match(cropper, /viewportHeight/);
  assert.match(cropper, /canvas\.height = outputHeight/);
});

test("menu client supplies safe defaults when older APIs omit new dish fields", async () => {
  const service = await readFile(
    new URL("../../src/services/menu.ts", import.meta.url),
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
    readFile(new URL("../../src/pages/menu/edit/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/menu/edit/index.wxml", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pageConfig).disableScroll, true);
  assert.match(page, /<scroll-view[\s\S]*class="edit-scroll page--fixed"[\s\S]*scroll-y/);
  assert.match(page, /show-scrollbar="\{\{false\}\}"/);
});

test("menu pages use only the 20rpx, 23rpx, and 25rpx business typography sizes", async () => {
  const styleUrls = [
    "../../src/pages/menu/index.less",
    "../../src/pages/menu/edit/index.less",
    "../../src/pages/menu/place/index.less",
    "../../src/pages/menu/place-edit/index.less",
    "../../src/pages/menu/day-plan/index.less",
    "../../src/pages/menu/print/index.less",
  ];
  const styles = await Promise.all(
    styleUrls.map((url) => readFile(new URL(url, import.meta.url), "utf8")),
  );
  const editPage = await readFile(
    new URL("../../src/pages/menu/edit/index.wxml", import.meta.url),
    "utf8",
  );

  for (const [index, style] of styles.entries()) {
    const businessStyle = style
      .replace(/\.meal-slot__placeholder-mark\s*\{[^}]*\}/g, "")
      .replace(/\.image-field__plus\s*\{[^}]*\}/g, "");
    const explicitSizes = [...businessStyle.matchAll(/font-size:\s*(\d+)rpx/g)].map(
      (match) => Number(match[1]),
    );
    assert.ok(
      explicitSizes.every((size) => size === 20 || size === 23 || size === 25),
      `${styleUrls[index]} contains a business font size outside 20rpx/23rpx/25rpx`,
    );
  }
  assert.match(styles[0], /\.quick-card__meta[^}]*font-size:\s*var\(--ui-font-size-small\)/);
  assert.match(styles[0], /\.quick-card__detail-label[^}]*font-size:\s*var\(--ui-font-size-small\)/);
  assert.match(styles[0], /\.quick-card__detail-value[^}]*font-size:\s*var\(--ui-font-size-small\)/);
  assert.match(styles[1], /\.field__input[^}]*font-size:\s*23rpx/);
  assert.match(styles[1], /\.item-entry__input[^}]*font-size:\s*23rpx/);
  assert.equal(editPage.match(/font-size="23rpx"/g)?.length, 4);
  assert.match(styles[4], /\.meal-section__title[^}]*font-size:\s*25rpx/);
  assert.match(styles[4], /\.meal-section__english[^}]*font-size:\s*23rpx/);
  assert.match(styles[5], /\.dish-card__name[^}]*font-size:\s*25rpx/);
});

test("shared UI typography defines 20rpx metadata, 23rpx body text, and 25rpx titles", async () => {
  const [guidance, appStyles, navigationStyles, dialogStyles, appInput] = await Promise.all([
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/custom-navigation/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-dialog/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-input/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(guidance, /20rpx.*23rpx.*25rpx/);
  assert.match(guidance, /Do not introduce `24rpx`/);
  assert.match(appStyles, /--ui-font-size-small:\s*20rpx/);
  assert.match(appStyles, /--ui-font-size-base:\s*23rpx/);
  assert.match(navigationStyles, /\.custom-navigation__title[^}]*font-size:\s*25rpx/);
  assert.match(dialogStyles, /\.app-dialog__title[^}]*font-size:\s*25rpx/);
  assert.match(appInput, /value:\s*"23rpx"/);
});

<template>
  <div class="menu-page usePx">
    <Header />

    <main class="menu-page__main">
      <section
        ref="workspaceRef"
        class="menu-workspace"
        aria-label="菜单卡片编辑区"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <div class="layout-tabs" role="tablist" aria-label="菜单版式切换">
          <button
            v-for="(page, index) in a4Pages"
            :key="page.key"
            type="button"
            class="layout-tabs__item"
            :class="{ 'layout-tabs__item--active': activePageIndex === index }"
            role="tab"
            :aria-selected="activePageIndex === index"
            @click="setActivePage(index)"
          >
            <span class="layout-tabs__label">
              {{ getPageTabLabel(page, index) }}
            </span>
          </button>
        </div>

        <div
          v-if="activeA4Page?.key === 'a6-landscape-single-image'"
          class="style-current"
          aria-label="当前菜单风格"
        >
          {{ activeA6Style.name }}
        </div>

        <div
          v-if="activeA4Page"
          class="menu-a4-preview-frame"
          :style="a4PreviewFrameStyle"
        >
          <div
            ref="a4SheetRef"
            :key="activeA4Page.key"
            :class="[
              'menu-a4-sheet',
              'usePx',
              `menu-a4-sheet--${activeA4Page.paperOrientation}`,
            ]"
            :style="a4PreviewSheetStyle"
            :aria-label="activeA4Page.label"
          >
            <article
              v-for="item in activeA4Page.items"
              :key="item.key"
              class="menu-card menu-card--a4"
              :style="{
                left: `${(item.x / activeA4Page.width) * 100}%`,
                top: `${(item.y / activeA4Page.height) * 100}%`,
                width: `${(item.width / activeA4Page.width) * 100}%`,
                height: `${(item.height / activeA4Page.height) * 100}%`,
                '--card-width-mm': item.width,
                '--card-height-mm': item.height,
                '--image-ratio': item.imageRatio,
                '--a6-background-image': activeA6BackgroundCss,
                ...getCardFrameStyle(item, activeA4Page.cardOrientation),
              }"
              :data-orientation="activeA4Page.cardOrientation"
              :data-page-key="activeA4Page.key"
              :data-a6-background-mode="
                activeA4Page.key === 'a6-landscape-single-image'
                  ? activeA6BackgroundMode
                  : undefined
              "
            >
              <div
                class="menu-card__image"
                role="button"
                tabindex="0"
                title="上传图片"
                @click="triggerImageUpload(item.cardIndex)"
                @keydown.enter.prevent="triggerImageUpload(item.cardIndex)"
                @keydown.space.prevent="triggerImageUpload(item.cardIndex)"
              >
                <img
                  v-if="item.card.imageUrl"
                  :src="item.card.imageUrl"
                  :alt="item.card.dishName"
                />
              </div>
              <div class="menu-card__caption">
                <template v-if="activeA4Page.key === 'a6-landscape-single-image'">
                  <div class="menu-card__text">
                    <div class="menu-card__eyebrow">TODAY'S PICK</div>
                    <h2 class="dish-name">
                      {{ getDishParts(item.card.dishName).name || "菜名" }}
                    </h2>
                    <div class="menu-card__meta">
                      {{ getDishParts(item.card.dishName).category }} · MENU IDEA
                    </div>
                  </div>
                </template>
                <h2 v-else class="dish-name">
                  {{ item.card.dishName || "菜名" }}
                </h2>
              </div>
            </article>
            <span
              v-for="mark in activeCutMarks"
              :key="mark.key"
              class="cut-mark"
              :class="`cut-mark--${mark.side}`"
              :style="{
                left: mark.left,
                top: mark.top,
              }"
            />
          </div>
        </div>

        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          accept="image/*"
          @change="handleImageChange"
        />
      </section>
    </main>

    <div class="floating-actions">
      <button
        type="button"
        class="action-btn"
        title="选择菜品"
        aria-label="选择菜品"
        @click="openFoodPickerModal"
      >
        <Utensils class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        :title="`切换风格：${activeA6Style.name}`"
        :aria-label="`切换风格，当前 ${activeA6Style.name}`"
        @click="cycleA6Style"
      >
        <Images class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        title="预览图片"
        aria-label="预览图片"
        :disabled="isGeneratingPreview"
        @click="handlePreviewImage"
      >
        <Download class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        title="打印 A6 菜单"
        aria-label="打印 A6 菜单"
        @click="handlePrint"
      >
        <Printer class="action-btn__icon" :size="22" />
      </button>
    </div>

    <div
      v-if="imagePreviewUrl"
      class="image-preview"
      @click="closeImagePreview"
    >
      <div class="image-preview__content" @click.stop>
        <button
          type="button"
          class="image-preview__close"
          @click="closeImagePreview"
        >
          ×
        </button>
        <img class="image-preview__img" :src="imagePreviewUrl" alt="图片预览" />
      </div>
    </div>

    <div
      v-if="showFoodPickerModal"
      class="edit-modal"
      @click="closeFoodPickerModal"
    >
      <div class="edit-modal__content" @click.stop>
        <div class="edit-modal__header">
          <h3 class="edit-modal__title">选择菜品</h3>
          <button
            type="button"
            class="edit-modal__close"
            @click="closeFoodPickerModal"
          >
            ×
          </button>
        </div>

        <div class="food-picker-tabs" role="tablist" aria-label="菜品状态切换">
          <button
            v-for="tab in foodPickerTabs"
            :key="tab.key"
            type="button"
            class="food-picker-tabs__item"
            :class="{
              'food-picker-tabs__item--active': activeFoodPickerTab === tab.key,
            }"
            role="tab"
            :aria-selected="activeFoodPickerTab === tab.key"
            @click="activeFoodPickerTab = tab.key"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="food-picker-list">
          <button
            v-for="item in activeFoodItems"
            :key="item.imageUrl"
            type="button"
            class="food-picker-card"
            :class="{
              'food-picker-card--active':
                currentCard?.imageUrl === item.imageUrl,
            }"
            @click="selectFoodItem(item)"
          >
            <img
              class="food-picker-card__image"
              :src="item.imageUrl"
              :alt="item.dishName"
            />
            <span class="food-picker-card__text">
              <span class="food-picker-card__category">
                {{ item.category }}
              </span>
              <span class="food-picker-card__name">
                {{ item.name }}
              </span>
            </span>
          </button>

          <div v-if="activeFoodItems.length === 0" class="food-picker-empty">
            暂无图片
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import Header from "@/components/Header.vue";
import { useStore, type MenuCardData } from "./store";
import { useCommonStore } from "@/store/commonStore";
import { Download, Images, Printer, Utensils } from "lucide-vue-next";
import {
  convertBackgroundImagesToBase64,
  replaceSVGCSSVariables,
} from "@/utils/dataToImages";
import html2canvas from "html2canvas";

const A6_PORTRAIT_WIDTH_MM = 105;
const A6_PORTRAIT_HEIGHT_MM = 148;
const PREVIEW_PX_PER_MM = 4;
const SCREEN_PREVIEW_SCALE = 0.9;
const IMAGE_EXPORT_WIDTH = 3000;
const PRINT_PAGE_STYLE_ID = "menu-print-page-style";
const A6_STYLE_INDEX_STORAGE_KEY = "MENU_A6_STYLE_INDEX";
const a6BackgroundImages = [
  { name: "基础极简01", src: encodeURI("/菜谱背景图/基础极简01.png") },
  { name: "复古咖啡厅03", src: encodeURI("/菜谱背景图/复古咖啡厅03.png") },
  { name: "家常手账01", src: encodeURI("/菜谱背景图/家常手账01.png") },
  { name: "日式喫茶01", src: encodeURI("/菜谱背景图/日式喫茶01.png") },
  { name: "菜市场果蔬01", src: encodeURI("/菜谱背景图/菜市场果蔬01.png") },
  { name: "老式小餐馆01", src: encodeURI("/菜谱背景图/老式小餐馆01.png") },
];
const dishCategories = [
  "荤菜",
  "半荤",
  "素菜",
  "主食",
  "水果",
  "外食",
  "甜品",
  "饮品",
];

type A4LayoutSpec = {
  key: string;
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  cardIndex: number;
  imageRatio: string;
  imageRatioLabel: string;
};

type A4LayoutItem = A4LayoutSpec & {
  card: MenuCardData;
};

type A4Page = {
  key: string;
  label: string;
  paperSize: "A4" | "A6";
  cardOrientation: "landscape" | "portrait";
  paperOrientation: "landscape" | "portrait";
  width: number;
  height: number;
  specs: A4LayoutSpec[];
};

type A4PageView = Omit<A4Page, "specs"> & {
  items: A4LayoutItem[];
};

type CutMark = {
  key: string;
  side: "top" | "bottom" | "left" | "right";
  left: string;
  top: string;
};

type FoodPickerTabKey = "pending" | "printed";

type FoodPickerItem = MenuCardData & {
  key: string;
  status: FoodPickerTabKey;
  category: string;
  name: string;
};

const foodPickerTabs: { key: FoodPickerTabKey; label: string }[] = [
  { key: "pending", label: "待打印" },
  { key: "printed", label: "已打印" },
];

function getFoodNameParts(filename: string) {
  const nameWithoutExtension = filename.replace(/\.[^.]+$/, "");
  const [category, ...nameParts] = nameWithoutExtension.split("·");
  const name = nameParts.join("·").trim();

  return {
    category: category.trim() || "菜单",
    name: name || nameWithoutExtension.trim(),
  };
}

function createFoodItem(
  status: FoodPickerTabKey,
  directory: string,
  filename: string,
  displayName?: string,
) {
  const { category, name } = getFoodNameParts(filename);
  const itemName = displayName || name;

  return {
    key: `${status}-${filename}`,
    status,
    category,
    name: itemName,
    dishName: `${category}·${itemName}`,
    imageUrl: encodeURI(`/${directory}/${filename}`),
  };
}

const foodPickerItems: FoodPickerItem[] = [
  createFoodItem("pending", "食物待打印", "半荤 · 番茄炒鸡蛋-复古食谱.png"),
  createFoodItem("pending", "食物待打印", "半荤 · 番茄炒鸡蛋-日式杂志.png"),
  createFoodItem(
    "pending",
    "食物待打印",
    "半荤 · 番茄炒鸡蛋-水彩手绘-透明.png",
    "番茄炒鸡蛋-透明底",
  ),
  createFoodItem("pending", "食物待打印", "半荤 · 番茄炒鸡蛋-干净实拍.png"),
  createFoodItem("pending", "食物待打印", "荤菜 · 香辣虾.PNG"),
  createFoodItem("pending", "食物待打印", "荤菜 · 煎牛排.PNG"),
  createFoodItem("pending", "食物待打印", "素菜 · 炒番薯叶.PNG"),
  createFoodItem("pending", "食物待打印", "荤菜 · 煎三文鱼扒.PNG"),
  createFoodItem("pending", "食物待打印", "半荤 · 菠萝炒牛肉.PNG"),
  createFoodItem("pending", "食物待打印", "主食 · 烤贝贝南瓜.PNG"),
  createFoodItem("pending", "食物待打印", "素菜 · 炒花菜.PNG"),
  createFoodItem("pending", "食物待打印", "荤菜 · 九层塔炒鸡.PNG"),
  createFoodItem("pending", "食物待打印", "荤菜 · 炒花甲.PNG"),
];

function loadA6StyleIndex() {
  const storedIndex = Number(localStorage.getItem(A6_STYLE_INDEX_STORAGE_KEY));

  if (Number.isInteger(storedIndex) && a6BackgroundImages[storedIndex]) {
    return storedIndex;
  }

  return 0;
}

const a4PageSpecs: A4Page[] = [
  {
    key: "a6-landscape-single-image",
    label: "A6 横版单图",
    paperSize: "A6",
    cardOrientation: "landscape",
    paperOrientation: "landscape",
    width: A6_PORTRAIT_HEIGHT_MM,
    height: A6_PORTRAIT_WIDTH_MM,
    specs: [
      {
        key: "a6-landscape-single-image-0",
        name: "A6横版单图 148×105mm",
        width: A6_PORTRAIT_HEIGHT_MM,
        height: A6_PORTRAIT_WIDTH_MM,
        x: 0,
        y: 0,
        cardIndex: 0,
        imageRatio: "148 / 105",
        imageRatioLabel: "A6横版",
      },
    ],
  },
];

const store = useStore();
const loadingStore = useCommonStore();
const workspaceRef = ref<HTMLElement | null>(null);
const a4SheetRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const formData = computed(() => store.formData);
const cards = computed(() => formData.value.cards);
const a4Pages = computed<A4PageView[]>(() =>
  a4PageSpecs.map(({ specs, ...page }) => ({
    ...page,
    items: specs.map((item) => ({
      ...item,
      card: cards.value[item.cardIndex] || cards.value[0],
    })),
  })),
);
const activeImageIndex = ref<number | null>(null);
const showFoodPickerModal = ref(false);
const activeFoodPickerTab = ref<FoodPickerTabKey>("pending");
const activePageIndex = ref(a4PageSpecs.length - 1);
const imagePreviewUrl = ref("");
const isGeneratingPreview = ref(false);
const activeA6StyleIndex = ref(loadA6StyleIndex());
const touchStartX = ref(0);
const touchStartY = ref(0);
const previewScale = ref(1);
let workspaceResizeObserver: ResizeObserver | null = null;

const activeA4Page = computed(() => a4Pages.value[activePageIndex.value]);
const currentCard = computed(() => activeA4Page.value?.items[0]?.card);
const activeFoodItems = computed(() =>
  foodPickerItems.filter((item) => item.status === activeFoodPickerTab.value),
);
const activeA6Style = computed(
  () => a6BackgroundImages[activeA6StyleIndex.value] || a6BackgroundImages[0],
);
const activeA6BackgroundCss = computed(() =>
  activeA6Style.value.src ? `url(${activeA6Style.value.src})` : "none",
);
const activeA6BackgroundMode = computed(() =>
  activeA6Style.value.src ? "image" : "plain",
);
const activeCutMarks = computed<CutMark[]>(() => {
  const page = activeA4Page.value;
  if (!page) return [];
  if (page.key === "a6-landscape-single-image") return [];

  const xPositions = Array.from(
    new Set(page.items.flatMap((item) => [item.x, item.x + item.width])),
  )
    .filter((x) => x >= 0 && x <= page.width)
    .sort((a, b) => a - b);
  const yPositions = Array.from(
    new Set(page.items.flatMap((item) => [item.y, item.y + item.height])),
  )
    .filter((y) => y >= 0 && y <= page.height)
    .sort((a, b) => a - b);
  const gridTop = yPositions[0] || 0;
  const topMarkTop = Math.max(0, gridTop - 4);

  return [
    ...xPositions.flatMap((x) => {
      const left = `${(x / page.width) * 100}%`;
      return [
        {
          key: `top-${x}`,
          side: "top" as const,
          left,
          top: `${(topMarkTop / page.height) * 100}%`,
        },
        { key: `bottom-${x}`, side: "bottom" as const, left, top: "100%" },
      ];
    }),
    ...yPositions.flatMap((y) => {
      const top = `${(y / page.height) * 100}%`;
      return [
        { key: `left-${y}`, side: "left" as const, left: "0", top },
        { key: `right-${y}`, side: "right" as const, left: "100%", top },
      ];
    }),
  ];
});
const activeA4BaseWidth = computed(
  () => (activeA4Page.value?.width || A6_PORTRAIT_HEIGHT_MM) * PREVIEW_PX_PER_MM,
);
const activeA4BaseHeight = computed(
  () =>
    (activeA4Page.value?.height || A6_PORTRAIT_WIDTH_MM) * PREVIEW_PX_PER_MM,
);
const a4PreviewFrameStyle = computed(() => ({
  width: `${activeA4BaseWidth.value * previewScale.value}px`,
  height: `${activeA4BaseHeight.value * previewScale.value}px`,
}));
const a4PreviewSheetStyle = computed(() => ({
  width: `${activeA4BaseWidth.value}px`,
  height: `${activeA4BaseHeight.value}px`,
  transform: `scale(${previewScale.value})`,
}));
const getPageTabLabel = (page: A4PageView, index: number) =>
  page.key === "a6-landscape-single-image"
    ? "A6 横版"
    : `${index + 1}/${a4Pages.value.length} ${page.cardOrientation === "landscape" ? "横版" : "竖版"}`;

const getDishParts = (dishName: string) => {
  const [category, ...nameParts] = dishName.split("·");
  const name = nameParts.join("·").trim();

  return {
    category: dishCategories.includes(category) ? category : "菜单",
    name: name || dishName,
  };
};

const mainstreamImageRatios = [
  9 / 16,
  2 / 3,
  3 / 4,
  4 / 5,
  1,
  5 / 4,
  4 / 3,
  3 / 2,
  16 / 9,
  2,
];

const findClosestMainstreamRatio = (ratio: number, minRatio = 0) => {
  const usableRatios = mainstreamImageRatios.filter(
    (current) => current >= minRatio,
  );
  const ratios = usableRatios.length > 0 ? usableRatios : mainstreamImageRatios;

  return ratios.reduce((closest, current) =>
    Math.abs(Math.log(current / ratio)) < Math.abs(Math.log(closest / ratio))
      ? current
      : closest,
  );
};

const getCardFrameStyle = (
  item: A4LayoutItem,
  orientation: A4Page["cardOrientation"],
) => {
  const captionHeight = orientation === "landscape" ? 9 : 14;
  const imageMaxWidth = item.width - 8;
  const imageMaxHeight = item.height - (orientation === "landscape" ? 18 : 24);
  const naturalRatio = imageMaxWidth / imageMaxHeight;
  const targetRatio = findClosestMainstreamRatio(naturalRatio, naturalRatio);

  const imageWidth = imageMaxWidth;
  const imageHeight = imageWidth / targetRatio;
  const imageLeft = 4;
  const imageTop = 4;
  const blankTop = imageTop + imageHeight;
  const blankHeight = item.height - blankTop;
  const captionTop = blankTop + Math.max(0, (blankHeight - captionHeight) / 2);

  return {
    "--image-left": `${(imageLeft / item.width) * 100}%`,
    "--image-top": `${(imageTop / item.height) * 100}%`,
    "--image-width": `${(imageWidth / item.width) * 100}%`,
    "--image-height": `${(imageHeight / item.height) * 100}%`,
    "--caption-left": `${(4 / item.width) * 100}%`,
    "--caption-top": `${(captionTop / item.height) * 100}%`,
    "--caption-width": `${((item.width - 8) / item.width) * 100}%`,
    "--caption-height": `${(captionHeight / item.height) * 100}%`,
  };
};

const triggerImageUpload = (index: number) => {
  activeImageIndex.value = index;
  fileInputRef.value?.click();
};

const handleImageChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  const cardIndex = activeImageIndex.value;
  if (!file || cardIndex === null) {
    activeImageIndex.value = null;
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") {
      store.setCardImage(cardIndex, reader.result);
    }
    input.value = "";
    activeImageIndex.value = null;
  };
  reader.readAsDataURL(file);
};

const openFoodPickerModal = () => {
  showFoodPickerModal.value = true;
};

const closeFoodPickerModal = () => {
  showFoodPickerModal.value = false;
};

const selectFoodItem = (item: FoodPickerItem) => {
  const page = activeA4Page.value;
  const cardIndex = page?.items[0]?.cardIndex ?? 0;
  store.setCardSelection(cardIndex, {
    imageUrl: item.imageUrl,
    dishName: item.dishName,
  });
  closeFoodPickerModal();
};

const applyPrintPageStyle = () => {
  const page = activeA4Page.value;
  if (!page) return;

  let style = document.getElementById(
    PRINT_PAGE_STYLE_ID,
  ) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement("style");
    style.id = PRINT_PAGE_STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    @media print {
      @page {
        size: ${page.width}mm ${page.height}mm;
        margin: 0;
      }
    }
  `;

  document.documentElement.style.setProperty(
    "--menu-print-width",
    `${page.width}mm`,
  );
  document.documentElement.style.setProperty(
    "--menu-print-height",
    `${page.height}mm`,
  );
};

const handlePrint = () => {
  applyPrintPageStyle();
  window.print();
};

const closeImagePreview = () => {
  if (imagePreviewUrl.value) {
    URL.revokeObjectURL(imagePreviewUrl.value);
    imagePreviewUrl.value = "";
  }
};

const handlePreviewImage = async () => {
  if (isGeneratingPreview.value) return;
  isGeneratingPreview.value = true;
  loadingStore.showLoading();

  const node = a4SheetRef.value;
  if (!node) {
    loadingStore.hideLoading();
    isGeneratingPreview.value = false;
    return;
  }

  const previousTransform = node.style.transform;

  try {
    await document.fonts.ready;
    node.style.transform = "none";

    const blob = await generateMenuImage(node);
    closeImagePreview();
    imagePreviewUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    console.error("生成菜单预览失败:", err);
  } finally {
    node.style.transform = previousTransform;
    loadingStore.hideLoading();
    isGeneratingPreview.value = false;
  }
};

async function generateMenuImage(node: HTMLElement): Promise<Blob> {
  await convertBackgroundImagesToBase64(node);
  replaceSVGCSSVariables(node);
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));

  const width = activeA4BaseWidth.value;
  const height = activeA4BaseHeight.value;
  const scale = IMAGE_EXPORT_WIDTH / width;
  const canvas = await html2canvas(node, {
    width,
    height,
    useCORS: true,
    scale,
    logging: false,
    backgroundColor: "#ffffff",
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob: Blob | null) =>
        blob ? resolve(blob) : reject(new Error("无法生成 blob")),
      "image/png",
    );
  });
}

const updatePreviewScale = () => {
  const workspace = workspaceRef.value;
  const page = activeA4Page.value;
  if (!workspace || !page) return;

  const rect = workspace.getBoundingClientRect();
  const baseWidth = page.width * PREVIEW_PX_PER_MM;
  const baseHeight = page.height * PREVIEW_PX_PER_MM;
  const scale =
    Math.min(rect.width / baseWidth, rect.height / baseHeight) *
    SCREEN_PREVIEW_SCALE;

  previewScale.value = Math.max(0.1, Math.min(1, scale));
};

const showPrevPage = () => {
  activePageIndex.value = Math.max(0, activePageIndex.value - 1);
};

const showNextPage = () => {
  activePageIndex.value = Math.min(
    a4Pages.value.length - 1,
    activePageIndex.value + 1,
  );
};

const setActivePage = (index: number) => {
  activePageIndex.value = index;
};

const setA6Style = (index: number) => {
  if (!a6BackgroundImages[index]) return;
  activeA6StyleIndex.value = index;
  localStorage.setItem(A6_STYLE_INDEX_STORAGE_KEY, String(index));
};

const cycleA6Style = () => {
  const nextIndex = (activeA6StyleIndex.value + 1) % a6BackgroundImages.length;
  setA6Style(nextIndex);
};

const handleTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch) return;

  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
};

const handleTouchEnd = (event: TouchEvent) => {
  const touch = event.changedTouches[0];
  if (!touch) return;

  const deltaX = touch.clientX - touchStartX.value;
  const deltaY = touch.clientY - touchStartY.value;

  if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
    return;
  }

  if (deltaX < 0) {
    showNextPage();
  } else {
    showPrevPage();
  }
};

watch(activePageIndex, async () => {
  await nextTick();
  updatePreviewScale();
});

onMounted(() => {
  store.hydrateCardImages();
  updatePreviewScale();

  if (workspaceRef.value) {
    workspaceResizeObserver = new ResizeObserver(updatePreviewScale);
    workspaceResizeObserver.observe(workspaceRef.value);
  }
});

onBeforeUnmount(() => {
  closeImagePreview();
  workspaceResizeObserver?.disconnect();
});
</script>

<style lang="less" scoped>
@font-face {
  font-family: "MenuTitle";
  src: url("/fonts/fangzhengfengyasong.woff2") format("woff2");
  font-display: swap;
}

@font-face {
  font-family: "MenuText";
  src: url("/fonts/FZLTHProGlobal-Semibold.woff2") format("woff2");
  font-display: swap;
}

.usePx.menu-page {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 60px 16px 84px;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow: hidden;
  background:
    radial-gradient(
      circle at 20% 4%,
      rgba(242, 163, 58, 0.12),
      transparent 28%
    ),
    radial-gradient(
      circle at 90% 10%,
      rgba(107, 145, 103, 0.12),
      transparent 30%
    ),
    #050508;
}

.usePx .menu-page__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 0;
  overflow: hidden;
}

.usePx .layout-switch {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 12px;
  padding: 4px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
}

.usePx .layout-switch__item {
  min-width: 66px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.usePx .layout-switch__item--active {
  background: #ffffff;
  color: #11131f;
}

.usePx .menu-workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  container-type: size;
}

.usePx .layout-tabs {
  position: relative;
  z-index: 20;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  box-sizing: border-box;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: rgba(17, 19, 31, 0.82);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.usePx .layout-tabs__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 74px;
  min-height: 30px;
  padding: 5px 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.1;
  white-space: nowrap;
  cursor: pointer;
}

.usePx .layout-tabs__label {
  line-height: 1.1;
}

.usePx .layout-tabs__item--active {
  background: #ffffff;
  color: #11131f;
}

.usePx .style-current {
  position: relative;
  z-index: 20;
  flex: 0 0 auto;
  max-width: 100%;
  min-height: 26px;
  padding: 0 14px;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 600;
  line-height: 26px;
  white-space: nowrap;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.usePx .menu-a4-preview-frame {
  position: relative;
  flex: 0 0 auto;
}

.usePx.menu-a4-sheet {
  --ink: #302720;
  --muted: #786c5d;
  --paper: #ffffff;

  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
  color: var(--ink);
  transform-origin: top left;
}

.usePx.menu-a4-sheet--landscape {
  aspect-ratio: 297 / 210;
}

.usePx.menu-a4-sheet--portrait {
  aspect-ratio: 210 / 297;
}

.usePx .cut-mark {
  position: absolute;
  z-index: 30;
  display: block;
  background: rgba(48, 39, 32, 0.72);
  pointer-events: none;
}

.usePx .cut-mark--top,
.usePx .cut-mark--bottom {
  width: 0.25mm;
  height: 4mm;
}

.usePx .cut-mark--top {
  transform: translateX(-0.125mm);
}

.usePx .cut-mark--bottom {
  transform: translate(-0.125mm, -4mm);
}

.usePx .cut-mark--left,
.usePx .cut-mark--right {
  width: 4mm;
  height: 0.25mm;
}

.usePx .cut-mark--left {
  transform: translateY(-0.125mm);
}

.usePx .cut-mark--right {
  transform: translate(-4mm, -0.125mm);
}

.usePx.menu-sheet {
  --ink: #302720;
  --muted: #786c5d;
  --paper: #ffffff;
  --red: #e66c55;
  --orange: #f2a33a;
  --green: #6b9167;
  --line: rgba(48, 39, 32, 0.16);

  position: relative;
  display: grid;
  box-sizing: border-box;
  overflow: hidden;
  padding: 0;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
  color: var(--ink);
}

.usePx.menu-sheet--four {
  --single-card-width: 71.05%;
  --single-card-height: 84.31%;
  --single-image-ratio: 99 / 62;

  display: flex;
  align-items: center;
  justify-content: center;
  place-items: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--instaxWidePortrait {
  --single-card-width: 84.31%;
  --single-card-height: 71.05%;
  --single-image-ratio: 62 / 99;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--six {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(2, 1fr);
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--threeInch {
  --single-card-width: 61.76%;
  --single-card-height: 58.55%;
  --single-image-ratio: 4 / 3;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--threeInchLandscape {
  --single-card-width: 58.55%;
  --single-card-height: 61.76%;
  --single-image-ratio: 4 / 3;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--sixPortrait {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--instaxMini {
  --single-card-width: 52.94%;
  --single-card-height: 56.58%;
  --single-image-ratio: 46 / 62;

  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.8%;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--instaxMiniLandscape {
  --single-card-width: 56.58%;
  --single-card-height: 52.94%;
  --single-image-ratio: 62 / 46;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--fourInch {
  --single-card-width: 74.51%;
  --single-card-height: 67.11%;
  --single-image-ratio: 4 / 3;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--fourInchLandscape {
  --single-card-width: 67.11%;
  --single-card-height: 74.51%;
  --single-image-ratio: 4 / 3;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--fiveInch {
  --single-card-width: 87.25%;
  --single-card-height: 83.55%;
  --single-image-ratio: 127 / 89;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--fiveInchLandscape {
  --single-card-width: 83.55%;
  --single-card-height: 87.25%;
  --single-image-ratio: 127 / 89;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx.menu-sheet--sixInch {
  --single-card-width: 100%;
  --single-card-height: 100%;
  --single-image-ratio: 102 / 152;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 390px, calc(100cqh * 102 / 152));
  aspect-ratio: 102 / 152;
}

.usePx.menu-sheet--sixInchLandscape {
  --single-card-width: 100%;
  --single-card-height: 100%;
  --single-image-ratio: 152 / 102;

  display: flex;
  align-items: center;
  justify-content: center;
  width: min(100cqw, 420px, calc(100cqh * 152 / 102));
  aspect-ratio: 152 / 102;
}

.usePx .menu-card {
  position: relative;
  display: grid;
  grid-template-rows: 66.666% 33.334%;
  min-width: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--paper);
}

.usePx .menu-card__image {
  min-width: 0;
  border: 0;
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.usePx .menu-card__image {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: #ffffff;
}

.usePx .menu-card__image img {
  display: block;
  width: 100%;
  height: 100%;
  flex: 0 0 auto;
  object-fit: cover;
  object-position: center center;
}

.usePx .menu-card__caption {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 0;
  gap: 7px;
  padding: 8px 10px;
  border: 0;
  isolation: isolate;
  outline: none;
  background: var(--paper);
  -webkit-tap-highlight-color: transparent;
}

.usePx .menu-card__image:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(242, 163, 58, 0.8);
}

.usePx {
  font-family: "font_6";
}
.usePx .dish-name {
  position: relative;
  z-index: 3;
  max-width: 100%;
  margin: 0;
  color: var(--ink);

  font-size: clamp(14px, 4.5vw, 18px);
  font-weight: 400;
  line-height: 1.2;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.usePx .menu-card--a4 {
  position: absolute;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 4%;
  padding: 4% 4% 7%;
  overflow: visible;
  outline: 0.25mm dashed rgba(48, 39, 32, 0.18);
  outline-offset: -0.25mm;
  background: #ffffff;
}

.usePx .menu-card--a4 .menu-card__image {
  width: 100%;
  height: auto;
  aspect-ratio: var(--image-ratio);
  background: #ffffff;
}

.usePx .menu-card--a4 .menu-card__caption {
  min-height: 0;
  gap: 0;
  padding: 0;
  background: transparent;
}

.usePx .menu-card--a4 .dish-name {
  font-size: 10.8px;
  line-height: 1.3;
}

.usePx .menu-card--a4[data-orientation="landscape"] {
  display: block;
  padding: 0;
  overflow: hidden;
}

.usePx .menu-card--a4[data-orientation="landscape"] .menu-card__image {
  position: absolute;
  left: var(--image-left);
  top: var(--image-top);
  width: var(--image-width);
  height: var(--image-height);
  aspect-ratio: auto;
  align-items: center;
  justify-content: center;
}

.usePx .menu-card--a4[data-orientation="landscape"] .menu-card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.usePx .menu-card--a4[data-orientation="landscape"] .menu-card__caption {
  position: absolute;
  left: var(--caption-left);
  top: var(--caption-top);
  width: var(--caption-width);
  height: var(--caption-height);
  min-height: auto;
  justify-content: center;
  overflow: hidden;
}

.usePx
  .menu-card--a4[data-page-key="instax-mini-landscape-grid"]
  .menu-card__image {
  left: calc((4 / 86) * 100%);
  top: calc((4 / 54) * 100%);
  width: calc((61.333 / 86) * 100%);
  height: calc((46 / 54) * 100%);
}

.usePx
  .menu-card--a4[data-page-key="instax-mini-landscape-grid"]
  .menu-card__caption {
  left: calc((69.333 / 86) * 100%);
  top: calc((4 / 54) * 100%);
  width: calc((12.667 / 86) * 100%);
  height: calc((46 / 54) * 100%);
  align-items: center;
  justify-content: center;
  padding-top: 0;
  box-sizing: border-box;
  text-align: center;
}

.usePx .menu-card--a4[data-page-key="instax-mini-landscape-grid"] .dish-name {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: 100%;
  font-size: 14px;
  line-height: 1;
  text-align: center;
  white-space: normal;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.usePx .menu-card--a4[data-grid-style] .menu-card__caption {
  border-left: 0.25mm solid rgba(48, 39, 32, 0.18);
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"] {
  outline: none;
  background:
    var(--a6-background-image) center / 100% 100% no-repeat,
    #ead7b4;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__image {
  left: calc((43 / 148) * 100%);
  top: calc((13 / 105) * 100%);
  width: calc((78 / 148) * 100%);
  height: calc((52 / 105) * 100%);
  border-radius: 1mm;
  background: transparent;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__image
  img {
  object-fit: contain;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__caption {
  left: calc((43 / 148) * 100%);
  top: calc((70 / 105) * 100%);
  width: calc((78 / 148) * 100%);
  height: calc((26 / 105) * 100%);
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  text-align: center;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__text {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__eyebrow {
  margin-bottom: 1.8mm;
  color: rgba(48, 39, 32, 0.54);
  font-family: "MenuText";
  font-size: 7px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.18em;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .menu-card__meta {
  margin-top: 2mm;
  color: rgba(48, 39, 32, 0.56);
  font-family: "MenuText";
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  letter-spacing: 0.1em;
}

.usePx
  .menu-card--a4[data-orientation="landscape"][data-page-key="a6-landscape-single-image"]
  .dish-name {
  width: 100%;
  max-width: 100%;
  color: #302720;
  font-size: 19px;
  line-height: 1.15;
  text-align: center;
  white-space: nowrap;
}

.usePx
  .menu-card--a4[data-orientation="portrait"][data-page-key="instax-mini-portrait-grid"]
  .menu-card__image {
  left: calc((4 / 54) * 100%);
  top: calc((4 / 86) * 100%);
  width: calc((46 / 54) * 100%);
  height: calc((62 / 86) * 100%);
}

.usePx
  .menu-card--a4[data-orientation="portrait"][data-page-key="instax-mini-portrait-grid"]
  .menu-card__caption {
  left: calc((4 / 54) * 100%);
  top: calc((70 / 86) * 100%);
  width: calc((46 / 54) * 100%);
  height: calc((12 / 86) * 100%);
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
  border-top: 0.25mm solid rgba(48, 39, 32, 0.18);
  padding-top: 6mm;
  text-align: center;
}

.usePx
  .menu-card--a4[data-orientation="portrait"][data-page-key="instax-mini-portrait-grid"]
  .dish-name {
  max-width: 100%;
  font-size: 10px;
  line-height: 1.25;
  text-align: center;
  white-space: nowrap;
}

.usePx .menu-card--a4[data-orientation="portrait"] {
  display: block;
  padding: 0;
  overflow: hidden;
}

.usePx .menu-card--a4[data-orientation="portrait"] .menu-card__image {
  position: absolute;
  left: var(--image-left);
  top: var(--image-top);
  width: var(--image-width);
  height: var(--image-height);
  aspect-ratio: auto;
  align-items: center;
  justify-content: center;
}

.usePx .menu-card--a4[data-orientation="portrait"] .menu-card__image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.usePx .menu-card--a4[data-orientation="portrait"] .menu-card__caption {
  position: absolute;
  left: var(--caption-left);
  top: var(--caption-top);
  width: var(--caption-width);
  height: var(--caption-height);
  min-height: auto;
  justify-content: center;
  overflow: hidden;
}

.usePx .menu-card--a4[data-orientation="portrait"] .dish-name {
  font-size: 10px;
  line-height: 1.25;
}

.usePx.menu-sheet--six .menu-card,
.usePx.menu-sheet--sixPortrait .menu-card {
  grid-template-rows: auto minmax(0, 1fr);
}

.usePx.menu-sheet--six .menu-card__image,
.usePx.menu-sheet--sixPortrait .menu-card__image {
  width: 100%;
  height: auto;
  aspect-ratio: 4 / 3;
}

.usePx.menu-sheet--six .menu-card__caption,
.usePx.menu-sheet--sixPortrait .menu-card__caption {
  min-height: 0;
  gap: 1px;
  padding: 2px 8px;
  box-sizing: border-box;
}

.usePx.menu-sheet--six .dish-name,
.usePx.menu-sheet--sixPortrait .dish-name {
  font-size: clamp(9px, 2.1vw, 11px);
  line-height: 1.35;
}

.usePx.menu-sheet--four .menu-card,
.usePx.menu-sheet--instaxWidePortrait .menu-card,
.usePx.menu-sheet--instaxMini .menu-card,
.usePx.menu-sheet--instaxMiniLandscape .menu-card,
.usePx.menu-sheet--threeInch .menu-card,
.usePx.menu-sheet--threeInchLandscape .menu-card,
.usePx.menu-sheet--fourInch .menu-card,
.usePx.menu-sheet--fourInchLandscape .menu-card,
.usePx.menu-sheet--fiveInch .menu-card,
.usePx.menu-sheet--fiveInchLandscape .menu-card,
.usePx.menu-sheet--sixInch .menu-card,
.usePx.menu-sheet--sixInchLandscape .menu-card {
  width: var(--single-card-width);
  height: var(--single-card-height);
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 4%;
  padding: 4% 4% 7%;
  aspect-ratio: auto;
  background: #ffffff;
  box-shadow: 0 3px 8px rgba(48, 39, 32, 0.12);
}

.usePx.menu-sheet--four .menu-card__image,
.usePx.menu-sheet--instaxWidePortrait .menu-card__image,
.usePx.menu-sheet--instaxMini .menu-card__image,
.usePx.menu-sheet--instaxMiniLandscape .menu-card__image,
.usePx.menu-sheet--threeInch .menu-card__image,
.usePx.menu-sheet--threeInchLandscape .menu-card__image,
.usePx.menu-sheet--fourInch .menu-card__image,
.usePx.menu-sheet--fourInchLandscape .menu-card__image,
.usePx.menu-sheet--fiveInch .menu-card__image,
.usePx.menu-sheet--fiveInchLandscape .menu-card__image,
.usePx.menu-sheet--sixInch .menu-card__image,
.usePx.menu-sheet--sixInchLandscape .menu-card__image {
  width: 100%;
  height: auto;
  aspect-ratio: var(--single-image-ratio);
  background: #ffffff;
}

.usePx.menu-sheet--instaxWidePortrait .menu-card__image,
.usePx.menu-sheet--instaxMini .menu-card__image,
.usePx.menu-sheet--threeInch .menu-card__image,
.usePx.menu-sheet--fourInch .menu-card__image,
.usePx.menu-sheet--fiveInch .menu-card__image,
.usePx.menu-sheet--sixInch .menu-card__image {
  align-items: flex-start;
}

.usePx.menu-sheet--instaxWidePortrait .menu-card__image img,
.usePx.menu-sheet--instaxMini .menu-card__image img,
.usePx.menu-sheet--threeInch .menu-card__image img,
.usePx.menu-sheet--fourInch .menu-card__image img,
.usePx.menu-sheet--fiveInch .menu-card__image img,
.usePx.menu-sheet--sixInch .menu-card__image img {
  object-position: center top;
}

.usePx.menu-sheet--four .menu-card__caption,
.usePx.menu-sheet--instaxWidePortrait .menu-card__caption,
.usePx.menu-sheet--instaxMini .menu-card__caption,
.usePx.menu-sheet--instaxMiniLandscape .menu-card__caption,
.usePx.menu-sheet--threeInch .menu-card__caption,
.usePx.menu-sheet--threeInchLandscape .menu-card__caption,
.usePx.menu-sheet--fourInch .menu-card__caption,
.usePx.menu-sheet--fourInchLandscape .menu-card__caption,
.usePx.menu-sheet--fiveInch .menu-card__caption,
.usePx.menu-sheet--fiveInchLandscape .menu-card__caption,
.usePx.menu-sheet--sixInch .menu-card__caption,
.usePx.menu-sheet--sixInchLandscape .menu-card__caption {
  min-height: 0;
  gap: 1px;
  padding: 0;
  background: transparent;
}

.usePx.menu-sheet--four .dish-name,
.usePx.menu-sheet--instaxWidePortrait .dish-name,
.usePx.menu-sheet--instaxMini .dish-name,
.usePx.menu-sheet--instaxMiniLandscape .dish-name,
.usePx.menu-sheet--threeInch .dish-name,
.usePx.menu-sheet--threeInchLandscape .dish-name,
.usePx.menu-sheet--fourInch .dish-name,
.usePx.menu-sheet--fourInchLandscape .dish-name,
.usePx.menu-sheet--fiveInch .dish-name,
.usePx.menu-sheet--fiveInchLandscape .dish-name,
.usePx.menu-sheet--sixInch .dish-name,
.usePx.menu-sheet--sixInchLandscape .dish-name {
  font-size: clamp(8px, 2vw, 11px);
  line-height: 1.3;
}

.usePx .file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.usePx .floating-actions {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom));
  left: 50%;
  z-index: 100;
  display: flex;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 40px;
  background: rgba(17, 19, 31, 0.8);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  transform: translateX(-50%);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.usePx .action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
    background: rgba(99, 102, 241, 0.15);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;

    &:active {
      transform: none;
      background: transparent;
    }
  }

  &__icon {
    color: var(--text-primary);
    line-height: 1;
  }
}

.usePx .menu-toast {
  position: fixed;
  left: 50%;
  bottom: calc(92px + env(safe-area-inset-bottom));
  z-index: 120;
  padding: 9px 14px;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: rgba(17, 19, 31, 0.92);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.36);
  transform: translateX(-50%);
  pointer-events: none;
}

.usePx .image-preview {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.88);
}

.usePx .image-preview__content {
  position: relative;
  max-width: 100%;
  max-height: 100%;
}

.usePx .image-preview__img {
  display: block;
  max-width: min(86vw, 720px);
  max-height: 84vh;
  border-radius: 12px;
  object-fit: contain;
  object-position: center center;
  -webkit-touch-callout: default;
  user-select: auto;
}

.usePx .image-preview__close {
  position: absolute;
  top: -14px;
  right: -14px;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: #111111;
  font-size: 22px;
  line-height: 34px;
  cursor: pointer;
}

.usePx .edit-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(5, 5, 8, 0.92);
  animation: fade-in 0.2s ease;
}

.usePx .edit-modal__content {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  padding: 20px;
  overflow-y: auto;
  box-sizing: border-box;
  border-radius: 20px 20px 0 0;
  background: #11131f;
  animation: slide-up 0.3s ease;
}

.usePx .edit-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.usePx .edit-modal__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
}

.usePx .edit-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: var(--input-bg);
  color: var(--text-secondary);
  font-size: 20px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--input-border);
    color: var(--text-primary);
  }
}

.usePx .food-picker-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  margin-bottom: 14px;
  padding: 4px;
  border: 1px solid var(--input-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
}

.usePx .food-picker-tabs__item {
  height: 34px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.usePx .food-picker-tabs__item--active {
  background: #ffffff;
  color: #11131f;
}

.usePx .food-picker-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.usePx .food-picker-card {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: 54px;
  padding: 7px;
  overflow: hidden;
  border: 1px solid var(--input-border);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.usePx .food-picker-card--active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.24);
}

.usePx .food-picker-card__image {
  display: block;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: #ffffff;
  object-fit: cover;
  object-position: center center;
}

.usePx .food-picker-card__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.usePx .food-picker-card__category {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usePx .food-picker-card__name {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.usePx .food-picker-empty {
  grid-column: 1 / -1;
  padding: 28px 0;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
}

.usePx .form-item {
  margin-bottom: 14px;
}

.usePx .form-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.usePx .dish-edit-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.usePx .dish-edit-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
}

.usePx .form-input,
.usePx .form-select,
.usePx .form-textarea {
  width: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.45;

  &:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
}

.usePx .form-select {
  appearance: auto;
}

.usePx .form-textarea {
  min-height: 210px;
  resize: vertical;
}

.usePx .form-item--action {
  margin-top: 8px;
  margin-bottom: 0;
}

.usePx .btn {
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &.btn-primary {
    width: 100%;
    padding: 14px;
    background: var(--accent);
    color: #ffffff;
    font-size: 16px;
    font-weight: 600;

    &:hover {
      background: var(--accent-hover);
    }
  }
}

@keyframes slide-up {
  from {
    transform: translateY(100%);
  }

  to {
    transform: translateY(0);
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }

  :global(html),
  :global(body),
  :global(#app) {
    width: var(--menu-print-width, 210mm) !important;
    height: var(--menu-print-height, 297mm) !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  :global(body) {
    background: #ffffff;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  :global(*) {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  :global(.header) {
    display: none !important;
  }

  .usePx.menu-page {
    position: fixed;
    inset: 0 auto auto 0;
    display: block;
    width: var(--menu-print-width, 210mm) !important;
    height: var(--menu-print-height, 297mm) !important;
    padding: 0;
    overflow: hidden;
    background: #ffffff;
  }

  .usePx .menu-page__main,
  .usePx .menu-workspace {
    display: block;
    width: var(--menu-print-width, 210mm) !important;
    height: var(--menu-print-height, 297mm) !important;
    margin: 0;
    overflow: hidden;
  }

  .usePx .floating-actions,
  .usePx .layout-tabs,
  .usePx .menu-toast,
  .usePx .image-preview,
  .usePx .edit-modal {
    display: none !important;
  }

  .usePx .menu-a4-preview-frame {
    position: fixed;
    top: 0;
    left: 0;
    width: var(--menu-print-width, 210mm) !important;
    height: var(--menu-print-height, 297mm) !important;
  }

  .usePx.menu-a4-sheet {
    position: fixed;
    top: 0;
    left: 0;
    transform: none !important;
    box-shadow: none;
    break-after: avoid;
    break-before: avoid;
    page-break-after: avoid;
    page-break-before: avoid;
  }

  .usePx.menu-a4-sheet--landscape,
  .usePx.menu-a4-sheet--portrait {
    width: var(--menu-print-width, 210mm) !important;
    height: var(--menu-print-height, 297mm) !important;
  }

  .usePx .menu-card--a4 .dish-name {
    font-size: 2.7mm;
  }

  .usePx .menu-card--a4[data-orientation="portrait"] .dish-name {
    font-size: 2.5mm;
  }

  .usePx .menu-card--a4[data-page-key="instax-mini-landscape-grid"] .dish-name {
    font-size: 3.5mm;
  }

  .usePx .menu-card--a4[data-page-key="a6-landscape-single-image"] .dish-name {
    font-size: 4.4mm;
    line-height: 1.15;
  }

  .usePx
    .menu-card--a4[data-page-key="a6-landscape-single-image"]
    .menu-card__eyebrow {
    margin-bottom: 1.8mm;
    font-size: 1.8mm;
  }

  .usePx
    .menu-card--a4[data-page-key="a6-landscape-single-image"]
    .menu-card__meta {
    margin-top: 2mm;
    font-size: 2mm;
  }
}

@media (min-width: 768px) {
  .usePx.menu-page {
    padding-bottom: 92px;
  }

  .usePx .menu-page__main {
    margin-top: 24px;
  }
}

@media (max-width: 360px) {
  .usePx.menu-sheet--four {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--instaxWidePortrait {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--six {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--threeInch {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--threeInchLandscape {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--fourInch {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--fourInchLandscape {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--fiveInch {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--fiveInchLandscape {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--sixInch {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--sixInchLandscape {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }

  .usePx.menu-sheet--sixPortrait {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--instaxMini {
    width: min(100cqw, 340px, calc(100cqh * 102 / 152));
  }

  .usePx.menu-sheet--instaxMiniLandscape {
    width: min(100cqw, 340px, calc(100cqh * 152 / 102));
  }
}
</style>

<template>
  <div class="menu-page usePx">
    <Header />

    <main class="menu-page__main">
      <section class="workspace-panel">
        <div class="workspace-panel__meta">当前功能区</div>
        <h1 class="workspace-panel__title">菜单</h1>
        <p class="workspace-panel__sub">{{ layoutDescription }}</p>
      </section>

      <section
        ref="workspaceRef"
        class="menu-workspace"
        aria-label="菜单卡片编辑区"
        @touchstart.passive="handleTouchStart"
        @touchend.passive="handleTouchEnd"
      >
        <div
          v-if="activeA4Page"
          class="menu-a4-preview-frame"
          :style="a4PreviewFrameStyle"
        >
          <div
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
              v-for="(item, index) in activeA4Page.items"
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
                ...getCardFrameStyle(item, activeA4Page.cardOrientation),
              }"
              :data-orientation="activeA4Page.cardOrientation"
              :data-page-key="activeA4Page.key"
              :data-grid-style="
                activeA4Page.key === 'instax-mini-landscape-grid'
                  ? index + 1
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
                <img :src="item.card.imageUrl" :alt="item.card.dishName" />
              </div>
              <div
                class="menu-card__caption"
                role="button"
                tabindex="0"
                title="编辑菜名和主要食材"
                @click="openEditModal(item.cardIndex)"
                @keydown.enter.prevent="openEditModal(item.cardIndex)"
                @keydown.space.prevent="openEditModal(item.cardIndex)"
              >
                <h2 class="dish-name">{{ item.card.dishName || "菜名" }}</h2>
              </div>
            </article>
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
        title="上一张"
        aria-label="上一张 A4"
        :disabled="activePageIndex === 0"
        @click="showPrevPage"
      >
        <ChevronLeft class="action-btn__icon" :size="22" />
      </button>
      <div class="page-indicator">{{ pageIndicatorText }}</div>
      <button
        type="button"
        class="action-btn"
        title="打印 A4 拼版"
        aria-label="打印 A4 拼版"
        @click="handlePrint"
      >
        <Printer class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        title="下一张"
        aria-label="下一张 A4"
        :disabled="activePageIndex === a4Pages.length - 1"
        @click="showNextPage"
      >
        <ChevronRight class="action-btn__icon" :size="22" />
      </button>
    </div>

    <div v-if="showEditModal" class="edit-modal" @click="closeEditModal">
      <div class="edit-modal__content" @click.stop>
        <div class="edit-modal__header">
          <h3 class="edit-modal__title">编辑菜单</h3>
          <button
            type="button"
            class="edit-modal__close"
            @click="closeEditModal"
          >
            ×
          </button>
        </div>

        <form class="edit-form" @submit.prevent="handleSaveEdit">
          <div class="form-item">
            <label class="form-label" for="menu-dish-name">菜名</label>
            <input
              id="menu-dish-name"
              v-model="editForm.dishName"
              class="form-input"
              type="text"
              maxlength="16"
            />
          </div>

          <div class="form-item">
            <label class="form-label" for="menu-ingredients">主要食材</label>
            <input
              id="menu-ingredients"
              v-model="editForm.ingredients"
              class="form-input"
              type="text"
              maxlength="36"
            />
          </div>

          <div class="form-item form-item--action">
            <button type="submit" class="btn btn-primary">保存</button>
          </div>
        </form>
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
  reactive,
  ref,
  watch,
} from "vue";
import Header from "@/components/Header.vue";
import { useStore, type MenuCardData } from "./store";
import { ChevronLeft, ChevronRight, Printer } from "lucide-vue-next";

const A4_PORTRAIT_WIDTH_MM = 210;
const A4_PORTRAIT_HEIGHT_MM = 297;
const PREVIEW_PX_PER_MM = 4;

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
  cardOrientation: "landscape" | "portrait";
  paperOrientation: "landscape" | "portrait";
  width: number;
  height: number;
  specs: A4LayoutSpec[];
};

type A4PageView = Omit<A4Page, "specs"> & {
  items: A4LayoutItem[];
};

const a4PageSpecs: A4Page[] = [
  {
    key: "landscape",
    label: "A4 横版菜单拼版",
    cardOrientation: "landscape",
    paperOrientation: "portrait",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    specs: [
      {
        key: "five-inch-landscape",
        name: "5寸横版 127×89mm",
        width: 127,
        height: 89,
        x: 0,
        y: 0,
        cardIndex: 0,
        imageRatio: "127 / 89",
        imageRatioLabel: "16:9",
      },
      {
        key: "instax-wide-landscape",
        name: "Instax Wide 108×86mm",
        width: 108,
        height: 86,
        x: 102,
        y: 89,
        cardIndex: 1,
        imageRatio: "99 / 62",
        imageRatioLabel: "3:2",
      },
      {
        key: "four-inch-landscape",
        name: "4寸横版 102×76mm",
        width: 102,
        height: 76,
        x: 0,
        y: 89,
        cardIndex: 2,
        imageRatio: "4 / 3",
        imageRatioLabel: "3:2",
      },
      {
        key: "three-inch-landscape",
        name: "3寸横版 89×63mm",
        width: 89,
        height: 63,
        x: 0,
        y: 165,
        cardIndex: 3,
        imageRatio: "4 / 3",
        imageRatioLabel: "16:9",
      },
      {
        key: "instax-square-landscape",
        name: "Instax Square 86×72mm",
        width: 86,
        height: 72,
        x: 89,
        y: 175,
        cardIndex: 4,
        imageRatio: "62 / 62",
        imageRatioLabel: "3:2",
      },
      {
        key: "instax-mini-landscape",
        name: "Instax Mini横版 86×54mm",
        width: 86,
        height: 54,
        x: 0,
        y: 228,
        cardIndex: 5,
        imageRatio: "62 / 46",
        imageRatioLabel: "2:1",
      },
    ],
  },
  {
    key: "portrait",
    label: "A4 竖版菜单拼版",
    cardOrientation: "portrait",
    paperOrientation: "portrait",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    specs: [
      {
        key: "five-inch-portrait",
        name: "5寸竖版 89×127mm",
        width: 89,
        height: 127,
        x: 0,
        y: 0,
        cardIndex: 0,
        imageRatio: "89 / 127",
        imageRatioLabel: "4:5",
      },
      {
        key: "instax-wide-portrait",
        name: "Instax Wide竖版 86×108mm",
        width: 86,
        height: 108,
        x: 102,
        y: 0,
        cardIndex: 1,
        imageRatio: "62 / 99",
        imageRatioLabel: "1:1",
      },
      {
        key: "instax-square-portrait",
        name: "Instax Square竖版 72×86mm",
        width: 72,
        height: 86,
        x: 124,
        y: 108,
        cardIndex: 4,
        imageRatio: "62 / 62",
        imageRatioLabel: "1:1",
      },
      {
        key: "four-inch-portrait",
        name: "4寸竖版 76×102mm",
        width: 76,
        height: 102,
        x: 0,
        y: 127,
        cardIndex: 2,
        imageRatio: "3 / 4",
        imageRatioLabel: "4:5",
      },
      {
        key: "three-inch-portrait",
        name: "3寸竖版 63×89mm",
        width: 63,
        height: 89,
        x: 76,
        y: 194,
        cardIndex: 3,
        imageRatio: "3 / 4",
        imageRatioLabel: "4:5",
      },
      {
        key: "instax-mini-portrait",
        name: "Instax Mini竖版 54×86mm",
        width: 54,
        height: 86,
        x: 139,
        y: 194,
        cardIndex: 5,
        imageRatio: "46 / 62",
        imageRatioLabel: "3:4",
      },
    ],
  },
  {
    key: "instax-mini-landscape-grid",
    label: "A4 Instax Mini 横版满铺",
    cardOrientation: "landscape",
    paperOrientation: "portrait",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    specs: Array.from({ length: 10 }, (_, index) => {
      const row = index % 5;
      const column = Math.floor(index / 5);

      return {
        key: `instax-mini-landscape-grid-${index}`,
        name: "Instax Mini横版 86×54mm",
        width: 86,
        height: 54,
        x: column * 86,
        y: row * 54,
        cardIndex: index,
        imageRatio: "62 / 46",
        imageRatioLabel: "4:3",
      };
    }),
  },
];

const store = useStore();
const workspaceRef = ref<HTMLElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const formData = computed(() => store.formData);
const cards = computed(() => formData.value.cards);
const layoutDescription =
  "A4 横版一张、竖版一张，去掉 6 寸，按真实尺寸放入 5寸、4寸、3寸、Instax Wide、Instax Square、Instax Mini";
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
const activeEditIndex = ref<number | null>(null);
const showEditModal = ref(false);
const activePageIndex = ref(0);
const touchStartX = ref(0);
const touchStartY = ref(0);
const previewScale = ref(1);
let workspaceResizeObserver: ResizeObserver | null = null;

const activeA4Page = computed(() => a4Pages.value[activePageIndex.value]);
const activeA4BaseWidth = computed(
  () => (activeA4Page.value?.width || A4_PORTRAIT_WIDTH_MM) * PREVIEW_PX_PER_MM,
);
const activeA4BaseHeight = computed(
  () =>
    (activeA4Page.value?.height || A4_PORTRAIT_HEIGHT_MM) * PREVIEW_PX_PER_MM,
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
const pageIndicatorText = computed(() => {
  const page = activeA4Page.value;
  if (!page) return "";
  return `${activePageIndex.value + 1}/${a4Pages.value.length} ${page.cardOrientation === "landscape" ? "横版" : "竖版"}`;
});

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

const editForm = reactive({
  dishName: "",
  ingredients: "",
});

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

const openEditModal = (index: number) => {
  const card = cards.value[index];
  if (!card) return;

  activeEditIndex.value = index;
  editForm.dishName = card.dishName;
  editForm.ingredients = card.ingredients;
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
  activeEditIndex.value = null;
};

const handleSaveEdit = () => {
  if (activeEditIndex.value === null) return;

  store.setCardText(
    activeEditIndex.value,
    editForm.dishName,
    editForm.ingredients,
  );
  closeEditModal();
};

const handlePrint = () => {
  window.print();
};

const updatePreviewScale = () => {
  const workspace = workspaceRef.value;
  const page = activeA4Page.value;
  if (!workspace || !page) return;

  const rect = workspace.getBoundingClientRect();
  const baseWidth = page.width * PREVIEW_PX_PER_MM;
  const baseHeight = page.height * PREVIEW_PX_PER_MM;
  const scale = Math.min(rect.width / baseWidth, rect.height / baseHeight);

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
  margin-top: 20px;
  overflow: hidden;
}

.usePx .workspace-panel {
  flex: 0 0 auto;
  width: min(390px, 100%);
  margin: 0 auto 14px;
}

.usePx .workspace-panel__meta {
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-muted);
}

.usePx .workspace-panel__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.usePx .workspace-panel__sub {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.3;
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
  min-height: 0;
  padding: 0;
  overflow: hidden;
  container-type: size;
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

.usePx .menu-card__image,
.usePx .menu-card__caption {
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
  gap: 7px;
  padding: 8px 10px;
  isolation: isolate;
  background: var(--paper);
}

.usePx .menu-card__image:focus-visible,
.usePx .menu-card__caption:focus-visible {
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

.usePx .ingredients {
  position: relative;
  z-index: 3;
  max-width: 100%;
  margin: 0;
  color: var(--muted);
  // font-family: "font_6";
  font-size: clamp(7px, 2.35vw, 9px);
  line-height: 1;
  letter-spacing: 0.02em;
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
}

.usePx
  .menu-card--a4[data-page-key="instax-mini-landscape-grid"]
  .dish-name {
  position: relative;
  max-width: none;
  max-height: 100%;
  font-size: 14px;
  line-height: 1;
  white-space: normal;
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.usePx .menu-card--a4[data-grid-style] .menu-card__caption {
  border-left: 0.25mm solid rgba(48, 39, 32, 0.18);
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

.usePx.menu-sheet--six .ingredients,
.usePx.menu-sheet--sixPortrait .ingredients {
  font-size: clamp(6px, 1.65vw, 8px);
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

.usePx.menu-sheet--four .ingredients,
.usePx.menu-sheet--instaxWidePortrait .ingredients,
.usePx.menu-sheet--instaxMini .ingredients,
.usePx.menu-sheet--instaxMiniLandscape .ingredients,
.usePx.menu-sheet--threeInch .ingredients,
.usePx.menu-sheet--threeInchLandscape .ingredients,
.usePx.menu-sheet--fourInch .ingredients,
.usePx.menu-sheet--fourInchLandscape .ingredients,
.usePx.menu-sheet--fiveInch .ingredients,
.usePx.menu-sheet--fiveInchLandscape .ingredients,
.usePx.menu-sheet--sixInch .ingredients,
.usePx.menu-sheet--sixInchLandscape .ingredients {
  font-size: clamp(5px, 1.45vw, 7px);
  line-height: 1.35;
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

.usePx .page-indicator {
  min-width: 70px;
  padding: 0 2px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 48px;
  text-align: center;
  white-space: nowrap;
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

.usePx .form-input {
  width: 100%;
  padding: 12px 14px;
  box-sizing: border-box;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
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
    width: 210mm !important;
    height: 297mm !important;
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
    width: 210mm !important;
    height: 297mm !important;
    padding: 0;
    overflow: hidden;
    background: #ffffff;
  }

  .usePx .menu-page__main,
  .usePx .menu-workspace {
    display: block;
    width: 210mm !important;
    height: 297mm !important;
    margin: 0;
    overflow: hidden;
  }

  .usePx .workspace-panel,
  .usePx .floating-actions,
  .usePx .menu-toast,
  .usePx .image-preview,
  .usePx .edit-modal {
    display: none !important;
  }

  .usePx .menu-a4-preview-frame {
    position: fixed;
    top: 0;
    left: 0;
    width: 210mm !important;
    height: 297mm !important;
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
    width: 210mm !important;
    height: 297mm !important;
  }

  .usePx .menu-card--a4 .dish-name {
    font-size: 2.7mm;
  }

  .usePx .menu-card--a4[data-orientation="portrait"] .dish-name {
    font-size: 2.5mm;
  }

  .usePx
    .menu-card--a4[data-page-key="instax-mini-landscape-grid"]
    .dish-name {
    font-size: 3.5mm;
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

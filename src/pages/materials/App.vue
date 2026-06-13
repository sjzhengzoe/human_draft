<template>
  <div
    class="materials-page usePx"
    :class="{ 'materials-page--exporting': isDownloadingImage }"
  >
    <Header />

    <main class="materials-main">
      <section class="paper-stage" :aria-label="activeMaterial.name">
        <div class="material-tabs" role="tablist" aria-label="素材模板切换">
          <button
            v-for="(material, index) in materials"
            :key="material.key"
            type="button"
            class="material-tabs__item"
            :class="{ 'material-tabs__item--active': activeMaterialIndex === index }"
            role="tab"
            :aria-selected="activeMaterialIndex === index"
            @click="setActiveMaterial(index)"
          >
            {{ material.shortName }}
          </button>
        </div>

        <div
          ref="paperSheetRef"
          class="paper-sheet"
          :class="[
            `paper-sheet--${activeMaterial.kind}`,
            { 'paper-sheet--exporting': isDownloadingImage },
          ]"
          :data-material-key="activeMaterial.key"
          :style="paperSheetStyle"
        >
          <div v-if="activeMaterial.kind === 'proof'" class="a6-style-proof">
            <img
              class="a6-style-proof__image"
              :src="activeProof.src"
              :alt="activeProof.name"
            />
            <div
              class="a6-style-proof__labels"
              :style="{
                gridTemplateColumns: `repeat(${activeProof.columns}, 1fr)`,
                gridTemplateRows: `repeat(${activeProof.rows}, 1fr)`,
              }"
              aria-hidden="true"
            >
              <div
                v-for="(label, index) in activeProof.labels"
                :key="label"
                class="a6-style-proof__label"
                :style="{
                  gridColumn: `${(index % activeProof.columns) + 1}`,
                  gridRow: `${Math.floor(index / activeProof.columns) + 1}`,
                }"
              >
                {{ index + 1 }}. {{ label }}
              </div>
            </div>
          </div>

          <div
            v-else-if="activeMaterial.kind === 'calibration'"
            class="print-calibration"
          >
            <div class="print-calibration__grid" aria-hidden="true" />
            <span
              v-for="frame in calibrationInsetFrames"
              :key="frame.key"
              class="print-calibration__inset-frame"
              :class="`print-calibration__inset-frame--${frame.key}`"
              :style="frame.style"
              aria-hidden="true"
            />
            <span
              v-for="line in calibrationCenterLines"
              :key="line.key"
              class="print-calibration__center-line"
              :class="`print-calibration__center-line--${line.key}`"
              :style="line.style"
              aria-hidden="true"
            />
            <span
              v-for="tick in calibrationTicks"
              :key="tick.key"
              class="print-calibration__tick"
              :class="[
                `print-calibration__tick--${tick.side}`,
                {
                  'print-calibration__tick--major': tick.isMajor,
                  'print-calibration__tick--medium': tick.isMedium,
                },
              ]"
              :style="tick.style"
              aria-hidden="true"
            />
            <span
              v-for="label in calibrationLabels"
              :key="label.key"
              class="print-calibration__label"
              :style="label.style"
            >
              {{ label.text }}
            </span>
            <span
              class="print-calibration__ruler print-calibration__ruler--horizontal"
            >
              <span>100mm / 10cm</span>
            </span>
            <span
              class="print-calibration__ruler print-calibration__ruler--vertical"
            >
              <span>100mm / 10cm</span>
            </span>
            <div class="print-calibration__summary">
              <strong>A4 打印校准</strong>
              <span>210mm × 297mm</span>
              <span>小格 1mm / 0.1cm</span>
              <span>四边读数看裁切</span>
              <span>100mm 参考尺看缩放</span>
            </div>
          </div>

          <div v-else class="upload-material">
            <button
              v-for="(slot, index) in activeUploadSlots"
              :key="slot.key"
              type="button"
              class="upload-slot"
              :class="{ 'upload-slot--active': activeSlotIndex === index }"
              :data-slot-key="slot.key"
              :style="getUploadSlotStyle(slot)"
              :title="`上传图片到${activeMaterial.name}`"
              @click="triggerImageUpload(index)"
            >
              <img
                v-if="uploadedImages[activeMaterial.key]?.[slot.key]"
                class="upload-slot__image"
                :src="uploadedImages[activeMaterial.key][slot.key]"
                alt="上传素材"
              />
              <span v-else class="upload-slot__placeholder">
                <ImagePlus :size="26" />
                <span>{{ slot.label }}</span>
              </span>
            </button>
            <span
              v-for="mark in activeCutMarks"
              :key="mark.key"
              class="cut-mark"
              :class="`cut-mark--${mark.side}`"
              :style="mark.style"
            />
          </div>
        </div>

        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          accept="image/*"
          multiple
          @change="handleImageChange"
        />
      </section>
    </main>

    <div class="floating-actions">
      <button
        v-if="activeMaterial.kind === 'upload'"
        type="button"
        class="action-btn"
        title="上传图片"
        aria-label="上传图片"
        @click="triggerImageUpload()"
      >
        <Upload class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        :title="`切换素材：${activeMaterial.name}`"
        :aria-label="`切换素材，当前 ${activeMaterial.name}`"
        @click="cycleMaterial"
      >
        <RefreshCw class="action-btn__icon" :size="22" />
      </button>
      <button
        v-if="canDownloadMaterialImage"
        type="button"
        class="action-btn"
        :title="`预览图片：${activeMaterial.name}`"
        :aria-label="`预览${activeMaterial.name}图片`"
        :disabled="isDownloadingImage"
        @click="handleDownloadImage"
      >
        <Download class="action-btn__icon" :size="22" />
      </button>
      <button type="button" class="action-btn" title="打印" @click="handlePrint">
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
          title="关闭"
          aria-label="关闭"
          @click="closeImagePreview"
        >
          ×
        </button>
        <img class="image-preview__img" :src="imagePreviewUrl" alt="图片预览" />
        <button
          type="button"
          class="image-preview__download"
          @click="downloadPreviewImage"
        >
          <Download :size="17" />
          保存图片
        </button>
      </div>
    </div>

    <div v-if="cropDraft" class="crop-modal" @click="closeCropEditor">
      <div class="crop-editor" @click.stop>
        <div class="crop-editor__header">
          <h2 class="crop-editor__title">裁剪图片</h2>
          <button
            type="button"
            class="crop-editor__icon-btn"
            title="关闭"
            aria-label="关闭"
            @click="closeCropEditor"
          >
            <X class="crop-editor__icon" :size="18" />
          </button>
        </div>

        <div class="crop-workspace">
          <div
            ref="cropFrameRef"
            class="crop-frame"
            :style="cropFrameStyle"
            @pointerdown="handleCropPointerDown"
            @pointermove="handleCropPointerMove"
            @pointerup="handleCropPointerUp"
            @pointercancel="handleCropPointerUp"
          >
            <img
              class="crop-frame__image"
              :src="cropDraft.src"
              alt="待裁剪图片"
              draggable="false"
              :style="cropImageStyle"
            />
            <span class="crop-frame__grid crop-frame__grid--v1" />
            <span class="crop-frame__grid crop-frame__grid--v2" />
            <span class="crop-frame__grid crop-frame__grid--h1" />
            <span class="crop-frame__grid crop-frame__grid--h2" />
          </div>
        </div>

        <label class="crop-zoom">
          <span class="crop-zoom__label">缩放</span>
          <input
            class="crop-zoom__input"
            type="range"
            min="1"
            max="3"
            step="0.01"
            :value="cropZoom"
            @input="handleCropZoomInput"
          />
        </label>

        <div class="crop-editor__actions">
          <button
            type="button"
            class="crop-editor__btn crop-editor__btn--ghost"
            @click="closeCropEditor"
          >
            取消
          </button>
          <button
            type="button"
            class="crop-editor__btn crop-editor__btn--primary"
            @click="confirmCrop"
          >
            <Check :size="17" />
            使用裁剪
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Header from "@/components/Header.vue";
import { computed, nextTick, ref } from "vue";
import {
  Check,
  Download,
  ImagePlus,
  Printer,
  RefreshCw,
  Upload,
  X,
} from "lucide-vue-next";
import html2canvas from "html2canvas";

const MATERIAL_INDEX_STORAGE_KEY = "MATERIALS_ACTIVE_INDEX";
const PRINT_PAGE_STYLE_ID = "materials-print-page-style";
const A6_LANDSCAPE_WIDTH_MM = 148;
const A6_LANDSCAPE_HEIGHT_MM = 105;
const A4_PORTRAIT_WIDTH_MM = 210;
const A4_PORTRAIT_HEIGHT_MM = 297;
const MAX_CROPPED_IMAGE_LONG_EDGE = 3508;
const IMAGE_EXPORT_DPI = 300;

type StyleProof = {
  kind: "proof";
  key: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  src: string;
  columns: number;
  rows: number;
  labels: string[];
};

type UploadSlot = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type UploadMaterial = {
  kind: "upload";
  key: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  slots: UploadSlot[];
};

type PrintCalibration = {
  kind: "calibration";
  key: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
};

type Material = UploadMaterial | StyleProof | PrintCalibration;

type CutMark = {
  key: string;
  side:
    | "top"
    | "bottom"
    | "left"
    | "right"
    | "center-horizontal"
    | "center-vertical";
  style: Record<string, string>;
};

type CalibrationTick = {
  key: string;
  side: "top" | "bottom" | "left" | "right";
  isMajor: boolean;
  isMedium: boolean;
  style: Record<string, string>;
};

type CalibrationLabel = {
  key: string;
  text: string;
  style: Record<string, string>;
};

type CalibrationGuide = {
  key: string;
  style: Record<string, string>;
};

type CropDraft = {
  materialKey: string;
  slotKey: string;
  targetRatio: number;
  src: string;
  imageWidth: number;
  imageHeight: number;
  frameWidth: number;
  frameHeight: number;
  minScale: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

type CropDragStart = {
  pointerId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
};

const uploadMaterials: UploadMaterial[] = [
  {
    kind: "upload",
    key: "menu-a6-landscape-two",
    name: "菜单打印",
    shortName: "菜单打印",
    width: A6_LANDSCAPE_WIDTH_MM,
    height: A6_LANDSCAPE_HEIGHT_MM * 2,
    slots: [
      {
        key: "top",
        label: "上传上方菜单",
        x: 0,
        y: 0,
        width: A6_LANDSCAPE_WIDTH_MM,
        height: A6_LANDSCAPE_HEIGHT_MM,
      },
      {
        key: "bottom",
        label: "上传下方菜单",
        x: 0,
        y: A6_LANDSCAPE_HEIGHT_MM,
        width: A6_LANDSCAPE_WIDTH_MM,
        height: A6_LANDSCAPE_HEIGHT_MM,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-landscape",
    name: "横版 A4",
    shortName: "横版 A4",
    width: A4_PORTRAIT_HEIGHT_MM,
    height: A4_PORTRAIT_WIDTH_MM,
    slots: [
      {
        key: "main",
        label: "上传横版 A4",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_HEIGHT_MM,
        height: A4_PORTRAIT_WIDTH_MM,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-portrait",
    name: "竖版 A4",
    shortName: "竖版 A4",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    slots: [
      {
        key: "main",
        label: "上传竖版 A4",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_WIDTH_MM,
        height: A4_PORTRAIT_HEIGHT_MM,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-landscape-two",
    name: "横版 A4 二合一",
    shortName: "横版二合一",
    width: A4_PORTRAIT_HEIGHT_MM,
    height: A4_PORTRAIT_WIDTH_MM,
    slots: [
      {
        key: "left",
        label: "上传左侧",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM,
      },
      {
        key: "right",
        label: "上传右侧",
        x: A4_PORTRAIT_HEIGHT_MM / 2,
        y: 0,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-portrait-two",
    name: "竖版 A4 二合一",
    shortName: "竖版二合一",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    slots: [
      {
        key: "top",
        label: "上传上方",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_WIDTH_MM,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
      {
        key: "bottom",
        label: "上传下方",
        x: 0,
        y: A4_PORTRAIT_HEIGHT_MM / 2,
        width: A4_PORTRAIT_WIDTH_MM,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-landscape-four",
    name: "横版 A4 四合一",
    shortName: "横版四合一",
    width: A4_PORTRAIT_HEIGHT_MM,
    height: A4_PORTRAIT_WIDTH_MM,
    slots: [
      {
        key: "top-left",
        label: "上传左上",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM / 2,
      },
      {
        key: "top-right",
        label: "上传右上",
        x: A4_PORTRAIT_HEIGHT_MM / 2,
        y: 0,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM / 2,
      },
      {
        key: "bottom-left",
        label: "上传左下",
        x: 0,
        y: A4_PORTRAIT_WIDTH_MM / 2,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM / 2,
      },
      {
        key: "bottom-right",
        label: "上传右下",
        x: A4_PORTRAIT_HEIGHT_MM / 2,
        y: A4_PORTRAIT_WIDTH_MM / 2,
        width: A4_PORTRAIT_HEIGHT_MM / 2,
        height: A4_PORTRAIT_WIDTH_MM / 2,
      },
    ],
  },
  {
    kind: "upload",
    key: "a4-portrait-four",
    name: "竖版 A4 四合一",
    shortName: "竖版四合一",
    width: A4_PORTRAIT_WIDTH_MM,
    height: A4_PORTRAIT_HEIGHT_MM,
    slots: [
      {
        key: "top-left",
        label: "上传左上",
        x: 0,
        y: 0,
        width: A4_PORTRAIT_WIDTH_MM / 2,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
      {
        key: "top-right",
        label: "上传右上",
        x: A4_PORTRAIT_WIDTH_MM / 2,
        y: 0,
        width: A4_PORTRAIT_WIDTH_MM / 2,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
      {
        key: "bottom-left",
        label: "上传左下",
        x: 0,
        y: A4_PORTRAIT_HEIGHT_MM / 2,
        width: A4_PORTRAIT_WIDTH_MM / 2,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
      {
        key: "bottom-right",
        label: "上传右下",
        x: A4_PORTRAIT_WIDTH_MM / 2,
        y: A4_PORTRAIT_HEIGHT_MM / 2,
        width: A4_PORTRAIT_WIDTH_MM / 2,
        height: A4_PORTRAIT_HEIGHT_MM / 2,
      },
    ],
  },
];

const printCalibrationMaterial: PrintCalibration = {
  kind: "calibration",
  key: "a4-print-calibration",
  name: "A4 打印校准",
  shortName: "打印校准",
  width: A4_PORTRAIT_WIDTH_MM,
  height: A4_PORTRAIT_HEIGHT_MM,
};

const styleProofs: StyleProof[] = [
  {
    kind: "proof",
    key: "a6-style-proof-01",
    name: "01 纸感手绘",
    shortName: "纸感手绘",
    width: A6_LANDSCAPE_WIDTH_MM,
    height: A6_LANDSCAPE_HEIGHT_MM,
    src: encodeURI("/素材打样/A6番茄炒蛋画风对比01.png"),
    columns: 4,
    rows: 2,
    labels: [
      "水彩手绘",
      "日式杂志",
      "水彩细线稿",
      "色铅笔食谱",
      "钢笔淡彩",
      "日式淡彩平涂",
      "轻水粉",
      "手账贴纸",
    ],
  },
  {
    kind: "proof",
    key: "a6-style-proof-02",
    name: "02 平面绘画",
    shortName: "平面绘画",
    width: A6_LANDSCAPE_WIDTH_MM,
    height: A6_LANDSCAPE_HEIGHT_MM,
    src: encodeURI("/素材打样/A6番茄炒蛋画风对比02.png"),
    columns: 4,
    rows: 2,
    labels: [
      "平面插画",
      "柔和平面",
      "印象派笔触",
      "后印象派色块",
      "油画棒肌理",
      "粉彩绘画",
      "现代海报插画",
      "绘本插画",
    ],
  },
  {
    kind: "proof",
    key: "a6-style-proof-03",
    name: "03 线稿小食物",
    shortName: "线稿小食物",
    width: A6_LANDSCAPE_WIDTH_MM,
    height: A6_LANDSCAPE_HEIGHT_MM,
    src: encodeURI("/素材打样/A6番茄炒蛋画风对比03.png"),
    columns: 4,
    rows: 2,
    labels: [
      "黑色线稿小食物",
      "手账涂鸦",
      "儿童绘本线描",
      "咖啡馆菜单线稿",
      "极简日式 doodle",
      "贴纸边框手绘",
      "粗马克笔线稿",
      "复古包装插画",
    ],
  },
  {
    kind: "proof",
    key: "a6-style-proof-04",
    name: "04 菜单参考",
    shortName: "菜单参考",
    width: A6_LANDSCAPE_WIDTH_MM,
    height: A6_LANDSCAPE_HEIGHT_MM,
    src: encodeURI("/素材打样/A6番茄炒蛋画风对比04.png"),
    columns: 3,
    rows: 3,
    labels: [
      "日系治愈动画风",
      "韩系 INS 菜单风",
      "二次元厚涂风",
      "新海诚电影感",
      "Q 版可爱风",
      "游戏料理 UI 风",
      "和风浮世绘二次元",
      "日漫食战夸张风",
      "轻像素二次元风",
    ],
  },
];

const legacyMaterials: Material[] = [...uploadMaterials, ...styleProofs];
const materials: Material[] = [
  printCalibrationMaterial,
  ...uploadMaterials,
  ...styleProofs,
];

function loadMaterialIndex() {
  const storedKey = localStorage.getItem("MATERIALS_ACTIVE_KEY");
  const storedKeyIndex = storedKey
    ? materials.findIndex((material) => material.key === storedKey)
    : -1;

  if (storedKeyIndex >= 0) return storedKeyIndex;

  const storedIndex = Number(localStorage.getItem(MATERIAL_INDEX_STORAGE_KEY));

  if (Number.isInteger(storedIndex) && legacyMaterials[storedIndex]) {
    const legacyKey = legacyMaterials[storedIndex].key;
    const migratedIndex = materials.findIndex(
      (material) => material.key === legacyKey,
    );

    if (migratedIndex >= 0) return migratedIndex;
  }

  if (Number.isInteger(storedIndex) && storedIndex >= legacyMaterials.length) {
    return materials.length - 1;
  }

  return 0;
}

const activeMaterialIndex = ref(loadMaterialIndex());
const activeSlotIndex = ref(0);
const fileInputRef = ref<HTMLInputElement | null>(null);
const paperSheetRef = ref<HTMLElement | null>(null);
const cropFrameRef = ref<HTMLElement | null>(null);
const uploadedImages = ref<Record<string, Record<string, string>>>({});
const cropDraft = ref<CropDraft | null>(null);
const cropDragStart = ref<CropDragStart | null>(null);
const isDownloadingImage = ref(false);
const imagePreviewUrl = ref("");
const imagePreviewFileName = ref("");
const activeMaterial = computed(
  () => materials[activeMaterialIndex.value] || materials[0],
);
const activeProof = computed(() =>
  activeMaterial.value.kind === "proof" ? activeMaterial.value : styleProofs[0],
);
const activeUploadSlots = computed(() =>
  activeMaterial.value.kind === "upload" ? activeMaterial.value.slots : [],
);
const paperSheetStyle = computed(() => ({
  "--paper-width-mm": `${activeMaterial.value.width}mm`,
  "--paper-height-mm": `${activeMaterial.value.height}mm`,
  "--paper-ratio": activeMaterial.value.width / activeMaterial.value.height,
  aspectRatio: `${activeMaterial.value.width} / ${activeMaterial.value.height}`,
}));
const cropFrameStyle = computed(() => ({
  "--crop-ratio": cropDraft.value?.targetRatio || 1,
  aspectRatio: cropDraft.value?.targetRatio || 1,
}));
const cropImageStyle = computed(() => {
  const draft = cropDraft.value;
  if (!draft) return {};

  return {
    width: `${draft.imageWidth * draft.scale}px`,
    height: `${draft.imageHeight * draft.scale}px`,
    transform: `translate(-50%, -50%) translate(${draft.offsetX}px, ${draft.offsetY}px)`,
  };
});
const cropZoom = computed(() => {
  const draft = cropDraft.value;
  if (!draft || draft.minScale <= 0) return 1;

  return draft.scale / draft.minScale;
});
const canDownloadMaterialImage = computed(
  () => getDownloadableMaterialFileName(activeMaterial.value) !== "",
);

const calibrationTicks: CalibrationTick[] = [
  ...createCalibrationAxisTicks(A4_PORTRAIT_WIDTH_MM, "horizontal"),
  ...createCalibrationAxisTicks(A4_PORTRAIT_HEIGHT_MM, "vertical"),
];
const calibrationLabels: CalibrationLabel[] = [
  ...createCalibrationAxisLabels(A4_PORTRAIT_WIDTH_MM, "horizontal"),
  ...createCalibrationAxisLabels(A4_PORTRAIT_HEIGHT_MM, "vertical"),
];
const calibrationInsetFrames: CalibrationGuide[] = [
  { key: "5mm", style: { inset: "5mm" } },
  { key: "10mm", style: { inset: "10mm" } },
];
const calibrationCenterLines: CalibrationGuide[] = [
  {
    key: "vertical",
    style: { left: `${A4_PORTRAIT_WIDTH_MM / 2}mm` },
  },
  {
    key: "horizontal",
    style: { top: `${A4_PORTRAIT_HEIGHT_MM / 2}mm` },
  },
];

function getCalibrationTickLength(value: number) {
  if (value % 10 === 0) return 18;
  if (value % 5 === 0) return 13;

  return 8;
}

function createCalibrationAxisTicks(
  max: number,
  axis: "horizontal" | "vertical",
): CalibrationTick[] {
  return Array.from({ length: max + 1 }, (_, value) => {
    const isMajor = value % 10 === 0;
    const isMedium = value % 5 === 0 && !isMajor;
    const style: Record<string, string> = {
      [axis === "horizontal" ? "left" : "top"]: `${value}mm`,
      "--tick-length": `${getCalibrationTickLength(value)}mm`,
    };

    if (axis === "horizontal") {
      return [
        {
          key: `top-${value}`,
          side: "top" as const,
          isMajor,
          isMedium,
          style,
        },
        {
          key: `bottom-${value}`,
          side: "bottom" as const,
          isMajor,
          isMedium,
          style,
        },
      ];
    }

    return [
      {
        key: `left-${value}`,
        side: "left" as const,
        isMajor,
        isMedium,
        style,
      },
      {
        key: `right-${value}`,
        side: "right" as const,
        isMajor,
        isMedium,
        style,
      },
    ];
  }).flat();
}

function createCalibrationAxisLabels(
  max: number,
  axis: "horizontal" | "vertical",
): CalibrationLabel[] {
  const values = Array.from({ length: Math.floor(max / 10) + 1 }, (_, index) =>
    index * 10,
  );
  const normalizedValues =
    values[values.length - 1] === max ? values : [...values, max];
  const labels: CalibrationLabel[] = [];

  for (const value of normalizedValues) {
    const text = `${value / 10}cm`;

    if (axis === "horizontal") {
      const horizontalStyle: Record<string, string> =
        value === 0
          ? { left: "1.8mm", transform: "none", textAlign: "left" }
          : value === max
            ? { right: "1.8mm", transform: "none", textAlign: "right" }
            : { left: `${value}mm`, transform: "translateX(-50%)" };

      labels.push(
        {
          key: `top-label-${value}`,
          text,
          style: {
            ...horizontalStyle,
            top: "20.2mm",
          },
        },
        {
          key: `bottom-label-${value}`,
          text,
          style: {
            ...horizontalStyle,
            bottom: "20.2mm",
          },
        },
      );
    } else {
      const verticalStyle: Record<string, string> =
        value === 0
          ? { top: "1.8mm", transform: "none" }
          : { top: `${value}mm`, transform: "translateY(-50%)" };

      labels.push(
        {
          key: `left-label-${value}`,
          text,
          style: {
            ...verticalStyle,
            left: "10.4mm",
          },
        },
        {
          key: `right-label-${value}`,
          text,
          style: {
            ...verticalStyle,
            right: "10.4mm",
            textAlign: "right",
          },
        },
      );
    }
  }

  return labels;
}

function roundMarkPosition(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeMarkPosition(value: number, max: number) {
  return roundMarkPosition(Math.max(0, Math.min(max, value)));
}

const activeCutMarks = computed<CutMark[]>(() => {
  const material = activeMaterial.value;
  if (material.kind !== "upload") return [];

  const xPositions = Array.from(
    new Set(
      material.slots.flatMap((slot) => [
        normalizeMarkPosition(slot.x, material.width),
        normalizeMarkPosition(slot.x + slot.width, material.width),
      ]),
    ),
  ).sort((left, right) => left - right);
  const yPositions = Array.from(
    new Set(
      material.slots.flatMap((slot) => [
        normalizeMarkPosition(slot.y, material.height),
        normalizeMarkPosition(slot.y + slot.height, material.height),
      ]),
    ),
  ).sort((top, bottom) => top - bottom);
  const innerXPositions = xPositions.filter((x) => x > 0 && x < material.width);
  const innerYPositions = yPositions.filter((y) => y > 0 && y < material.height);
  const innerVerticalMarkYs =
    innerYPositions.length > 0
      ? innerYPositions
      : innerXPositions.length > 0
        ? [material.height / 2]
        : [];
  const innerHorizontalMarkXs =
    innerXPositions.length > 0
      ? innerXPositions
      : innerYPositions.length > 0
        ? [material.width / 2]
        : [];

  return [
    ...xPositions.flatMap((x) => {
      const left = `${(x / material.width) * 100}%`;
      return [
        {
          key: `top-${x}`,
          side: "top" as const,
          style: { left, top: "0" },
        },
        {
          key: `bottom-${x}`,
          side: "bottom" as const,
          style: { left, top: "100%" },
        },
      ];
    }),
    ...yPositions.flatMap((y) => {
      const top = `${(y / material.height) * 100}%`;
      return [
        {
          key: `left-${y}`,
          side: "left" as const,
          style: { left: "0", top },
        },
        {
          key: `right-${y}`,
          side: "right" as const,
          style: { left: "100%", top },
        },
      ];
    }),
    ...innerXPositions.flatMap((x) =>
      innerVerticalMarkYs.map((y) => {
        const left = `${(x / material.width) * 100}%`;
        const top = `${(y / material.height) * 100}%`;

        return {
          key: `center-vertical-${x}-${y}`,
          side: "center-vertical" as const,
          style: { left, top },
        };
      }),
    ),
    ...innerYPositions.flatMap((y) =>
      innerHorizontalMarkXs.map((x) => {
        const left = `${(x / material.width) * 100}%`;
        const top = `${(y / material.height) * 100}%`;

        return {
          key: `center-horizontal-${x}-${y}`,
          side: "center-horizontal" as const,
          style: { left, top },
        };
      }),
    ),
  ];
});

const setActiveMaterial = (index: number) => {
  if (!materials[index]) return;
  activeMaterialIndex.value = index;
  activeSlotIndex.value = 0;
  localStorage.setItem(MATERIAL_INDEX_STORAGE_KEY, String(index));
  localStorage.setItem("MATERIALS_ACTIVE_KEY", materials[index].key);
};

const cycleMaterial = () => {
  setActiveMaterial((activeMaterialIndex.value + 1) % materials.length);
};

const getUploadSlotStyle = (slot: UploadSlot) => {
  const material = activeMaterial.value;

  return {
    left: `${(slot.x / material.width) * 100}%`,
    top: `${(slot.y / material.height) * 100}%`,
    width: `${(slot.width / material.width) * 100}%`,
    height: `${(slot.height / material.height) * 100}%`,
  };
};

const getNextUploadSlotIndex = () => {
  const material = activeMaterial.value;
  if (material.kind !== "upload") return 0;

  const images = uploadedImages.value[material.key] || {};
  const emptyIndex = material.slots.findIndex((slot) => !images[slot.key]);

  return emptyIndex >= 0 ? emptyIndex : activeSlotIndex.value;
};

const triggerImageUpload = (slotIndex = getNextUploadSlotIndex()) => {
  if (activeMaterial.value.kind !== "upload") return;
  activeSlotIndex.value = Math.max(
    0,
    Math.min(slotIndex, activeMaterial.value.slots.length - 1),
  );
  fileInputRef.value?.click();
};

const handleImageChange = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  const material = activeMaterial.value;
  const slot = activeUploadSlots.value[activeSlotIndex.value];

  if (files.length === 0 || material.kind !== "upload" || !slot) {
    input.value = "";
    return;
  }

  try {
    if (files.length === 1) {
      await openCropEditor(
        files[0],
        material.key,
        slot.key,
        slot.width / slot.height,
      );
    } else {
      await applyMultipleImages(files, material);
    }
  } catch (err) {
    console.error("处理上传图片失败:", err);
  } finally {
    input.value = "";
  }
};

const applyMultipleImages = async (files: File[], material: UploadMaterial) => {
  const startIndex = activeSlotIndex.value;
  const targetSlots = material.slots.slice(startIndex, startIndex + files.length);
  const nextImages: Record<string, string> = {
    ...(uploadedImages.value[material.key] || {}),
  };

  for (const [index, file] of files.entries()) {
    const targetSlot = targetSlots[index];
    if (!targetSlot) break;

    nextImages[targetSlot.key] = await cropFileToRatio(
      file,
      targetSlot.width / targetSlot.height,
    );
  }

  uploadedImages.value = {
    ...uploadedImages.value,
    [material.key]: nextImages,
  };
};

const applyPrintPageStyle = () => {
  const material = activeMaterial.value;
  const { width, height } = material;
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
        size: ${width}mm ${height}mm;
        margin: 0;
      }

      html,
      body,
      #app {
        width: ${width}mm !important;
        height: ${height}mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
    }
  `;

  document.documentElement.style.setProperty(
    "--materials-print-width",
    `${width}mm`,
  );
  document.documentElement.style.setProperty(
    "--materials-print-height",
    `${height}mm`,
  );
};

const handlePrint = () => {
  applyPrintPageStyle();
  window.print();
};

function getDownloadableMaterialFileName(material: Material) {
  if (material.key === "a4-landscape-four") return "横版A4四合一.png";
  if (material.key === "a4-print-calibration") return "A4打印校准.png";

  return "";
}

const handleDownloadImage = async () => {
  const node = paperSheetRef.value;
  const material = activeMaterial.value;
  const previewFileName = getDownloadableMaterialFileName(material);

  if (!node || !previewFileName || isDownloadingImage.value) {
    return;
  }

  isDownloadingImage.value = true;
  let exportHost: HTMLElement | null = null;

  try {
    await nextTick();
    await document.fonts.ready;

    const exportNodes = createImageExportNodes(node, material);
    exportHost = exportNodes.host;
    const rect = exportNodes.target.getBoundingClientRect();
    const outputWidth = mmToPx(material.width, IMAGE_EXPORT_DPI);
    const scale = outputWidth / rect.width;
    const canvas = await html2canvas(exportNodes.target, {
      width: rect.width,
      height: rect.height,
      scale,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      ignoreElements: (element: Element) =>
        element.classList.contains("upload-slot__placeholder"),
    });
    const blob = await canvasToBlob(canvas);
    closeImagePreview();
    imagePreviewFileName.value = previewFileName;
    imagePreviewUrl.value = URL.createObjectURL(blob);
  } catch (err) {
    console.error(`生成${material.name}预览图片失败:`, err);
  } finally {
    exportHost?.remove();
    isDownloadingImage.value = false;
  }
};

function createImageExportNodes(node: HTMLElement, material: Material) {
  const host = document.createElement("div");
  const sheet = node.cloneNode(true) as HTMLElement;

  host.className = "materials-page usePx materials-page--exporting";
  copyVueScopeAttributes(node, host);
  host.style.position = "fixed";
  host.style.top = "0";
  host.style.right = "auto";
  host.style.bottom = "auto";
  host.style.left = "-10000px";
  host.style.display = "block";
  host.style.width = `${material.width}mm`;
  host.style.height = `${material.height}mm`;
  host.style.padding = "0";
  host.style.margin = "0";
  host.style.overflow = "hidden";
  host.style.boxSizing = "border-box";
  host.style.background = "#ffffff";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";

  sheet.classList.add("paper-sheet--exporting");
  sheet.style.position = "relative";
  sheet.style.top = "auto";
  sheet.style.left = "auto";
  sheet.style.width = `${material.width}mm`;
  sheet.style.height = `${material.height}mm`;
  sheet.style.maxHeight = "none";
  sheet.style.aspectRatio = `${material.width} / ${material.height}`;
  sheet.style.boxShadow = "none";

  host.appendChild(sheet);
  document.body.appendChild(host);

  return { host, sheet, target: host };
}

function copyVueScopeAttributes(source: HTMLElement, target: HTMLElement) {
  Array.from(source.attributes)
    .filter((attribute) => attribute.name.startsWith("data-v-"))
    .forEach((attribute) => target.setAttribute(attribute.name, attribute.value));
}

const closeImagePreview = () => {
  if (!imagePreviewUrl.value) return;

  URL.revokeObjectURL(imagePreviewUrl.value);
  imagePreviewUrl.value = "";
  imagePreviewFileName.value = "";
};

const downloadPreviewImage = () => {
  if (!imagePreviewUrl.value) return;

  const link = document.createElement("a");
  link.href = imagePreviewUrl.value;
  link.download = imagePreviewFileName.value || `${activeMaterial.value.name}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

function mmToPx(mm: number, dpi: number) {
  return Math.round((mm / 25.4) * dpi);
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("无法生成图片"))),
      "image/png",
    );
  });
}

const openCropEditor = async (
  file: File,
  materialKey: string,
  slotKey: string,
  targetRatio: number,
) => {
  const src = await readFileAsDataUrl(file);
  const image = await loadImage(src);

  cropDraft.value = {
    materialKey,
    slotKey,
    targetRatio,
    src,
    imageWidth: image.naturalWidth || image.width,
    imageHeight: image.naturalHeight || image.height,
    frameWidth: 0,
    frameHeight: 0,
    minScale: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
  };

  await nextTick();
  resetCropMetrics();
};

const closeCropEditor = () => {
  cropDraft.value = null;
  cropDragStart.value = null;
};

const resetCropMetrics = () => {
  const draft = cropDraft.value;
  const frame = cropFrameRef.value;
  if (!draft || !frame) return;

  const rect = frame.getBoundingClientRect();
  const minScale = Math.max(
    rect.width / draft.imageWidth,
    rect.height / draft.imageHeight,
  );

  draft.frameWidth = rect.width;
  draft.frameHeight = rect.height;
  draft.minScale = minScale;
  draft.scale = minScale;
  draft.offsetX = 0;
  draft.offsetY = 0;
};

const clampCropOffset = () => {
  const draft = cropDraft.value;
  if (!draft) return;

  const displayedWidth = draft.imageWidth * draft.scale;
  const displayedHeight = draft.imageHeight * draft.scale;
  const maxOffsetX = Math.max(0, (displayedWidth - draft.frameWidth) / 2);
  const maxOffsetY = Math.max(0, (displayedHeight - draft.frameHeight) / 2);

  draft.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, draft.offsetX));
  draft.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, draft.offsetY));
};

const handleCropPointerDown = (event: PointerEvent) => {
  const draft = cropDraft.value;
  if (!draft) return;

  cropDragStart.value = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    offsetX: draft.offsetX,
    offsetY: draft.offsetY,
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
};

const handleCropPointerMove = (event: PointerEvent) => {
  const draft = cropDraft.value;
  const start = cropDragStart.value;
  if (!draft || !start || start.pointerId !== event.pointerId) return;

  draft.offsetX = start.offsetX + event.clientX - start.x;
  draft.offsetY = start.offsetY + event.clientY - start.y;
  clampCropOffset();
};

const handleCropPointerUp = (event: PointerEvent) => {
  const start = cropDragStart.value;
  if (!start || start.pointerId !== event.pointerId) return;

  cropDragStart.value = null;
};

const handleCropZoomInput = (event: Event) => {
  const draft = cropDraft.value;
  const input = event.target as HTMLInputElement;
  if (!draft) return;

  draft.scale = draft.minScale * Number(input.value);
  clampCropOffset();
};

const confirmCrop = async () => {
  const draft = cropDraft.value;
  if (!draft) return;

  try {
    const imageUrl = await cropDraftToDataUrl(draft);
    uploadedImages.value = {
      ...uploadedImages.value,
      [draft.materialKey]: {
        ...(uploadedImages.value[draft.materialKey] || {}),
        [draft.slotKey]: imageUrl,
      },
    };
    closeCropEditor();
  } catch (err) {
    console.error("裁剪上传图片失败:", err);
  }
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("无法读取图片"));
    reader.onerror = () => reject(reader.error || new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法加载图片"));
    image.src = src;
  });
}

async function cropFileToRatio(file: File, targetRatio: number) {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  return drawCroppedImageToDataUrl(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    targetRatio,
  );
}

async function cropDraftToDataUrl(draft: CropDraft) {
  const image = await loadImage(draft.src);
  const displayedWidth = draft.imageWidth * draft.scale;
  const displayedHeight = draft.imageHeight * draft.scale;
  const imageLeft = draft.frameWidth / 2 + draft.offsetX - displayedWidth / 2;
  const imageTop = draft.frameHeight / 2 + draft.offsetY - displayedHeight / 2;
  const cropX = Math.max(0, -imageLeft / draft.scale);
  const cropY = Math.max(0, -imageTop / draft.scale);
  const cropWidth = Math.min(
    draft.imageWidth - cropX,
    draft.frameWidth / draft.scale,
  );
  const cropHeight = Math.min(
    draft.imageHeight - cropY,
    draft.frameHeight / draft.scale,
  );

  return drawCroppedImageToDataUrl(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    draft.targetRatio,
  );
}

function drawCroppedImageToDataUrl(
  image: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number,
  targetRatio: number,
) {
  const outputLongEdge = Math.min(
    Math.max(cropWidth, cropHeight),
    MAX_CROPPED_IMAGE_LONG_EDGE,
  );
  const outputWidth =
    cropWidth >= cropHeight ? outputLongEdge : outputLongEdge * targetRatio;
  const outputHeight =
    cropHeight >= cropWidth ? outputLongEdge : outputLongEdge / targetRatio;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) throw new Error("浏览器不支持图片裁剪");

  canvas.width = Math.round(outputWidth);
  canvas.height = Math.round(outputHeight);
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL("image/png");
}
</script>

<style lang="less" scoped>
.usePx.materials-page {
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
      circle at 18% 8%,
      rgba(242, 163, 58, 0.12),
      transparent 28%
    ),
    radial-gradient(
      circle at 88% 12%,
      rgba(107, 145, 103, 0.12),
      transparent 30%
    ),
    #050508;
}

.usePx .materials-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  margin-top: 0;
  overflow: hidden;
}

.usePx .paper-stage {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 0;
  overflow: hidden;
  container-type: size;
}

.usePx .material-tabs {
  position: relative;
  z-index: 20;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  max-width: 100%;
  padding: 4px;
  overflow-x: auto;
  box-sizing: border-box;
  border: 1px solid var(--panel-border);
  border-radius: 999px;
  background: rgba(17, 19, 31, 0.82);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
  scrollbar-width: none;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.usePx .material-tabs::-webkit-scrollbar {
  display: none;
}

.usePx .material-tabs__item {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: 72px;
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

.usePx .material-tabs__item--active {
  background: #ffffff;
  color: #11131f;
}

.usePx .paper-sheet {
  --paper-width-mm: 148mm;
  --paper-height-mm: 105mm;
  --paper-ratio: 1.4095;
  --paper-stage-reserved-height: 52px;

  position: relative;
  flex: 0 1 auto;
  width: min(
    100cqw,
    var(--paper-width-mm),
    calc((100cqh - var(--paper-stage-reserved-height)) * var(--paper-ratio))
  );
  max-height: calc(100cqh - var(--paper-stage-reserved-height));
  box-sizing: border-box;
  background: #ffffff;
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
}

.usePx .a6-style-proof {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  overflow: hidden;
  background: #ffffff;
}

.usePx .a6-style-proof__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.usePx .a6-style-proof__labels {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  pointer-events: none;
}

.usePx .a6-style-proof__label {
  align-self: end;
  justify-self: center;
  max-width: 30mm;
  margin-bottom: 2mm;
  padding: 1mm 1.6mm;
  border: 0.1mm solid rgba(17, 24, 39, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.86);
  color: #1f2937;
  font-size: 6px;
  font-weight: 600;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.usePx .print-calibration {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #ffffff;
  color: rgba(75, 85, 99, 0.92);
  font-family:
    "PingFang SC",
    "Noto Sans SC",
    "Microsoft YaHei",
    Arial,
    sans-serif;
}

.usePx .print-calibration__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(
      to right,
      rgba(107, 114, 128, 0.16) 0 0.04mm,
      transparent 0.04mm
    ),
    linear-gradient(
      to bottom,
      rgba(107, 114, 128, 0.16) 0 0.04mm,
      transparent 0.04mm
    ),
    linear-gradient(
      to right,
      rgba(107, 114, 128, 0.28) 0 0.08mm,
      transparent 0.08mm
    ),
    linear-gradient(
      to bottom,
      rgba(107, 114, 128, 0.28) 0 0.08mm,
      transparent 0.08mm
    );
  background-size:
    1mm 1mm,
    1mm 1mm,
    10mm 10mm,
    10mm 10mm;
}

.usePx .print-calibration__inset-frame {
  position: absolute;
  z-index: 2;
  border: 0.12mm dashed rgba(107, 114, 128, 0.58);
  pointer-events: none;
}

.usePx .print-calibration__inset-frame--10mm {
  border-style: solid;
  border-color: rgba(107, 114, 128, 0.58);
}

.usePx .print-calibration__center-line {
  position: absolute;
  z-index: 2;
  display: block;
  pointer-events: none;
}

.usePx .print-calibration__center-line--vertical {
  top: 0;
  bottom: 0;
  width: 0.12mm;
  border-left: 0.12mm dashed rgba(107, 114, 128, 0.58);
  transform: translateX(-0.06mm);
}

.usePx .print-calibration__center-line--horizontal {
  right: 0;
  left: 0;
  height: 0.12mm;
  border-top: 0.12mm dashed rgba(107, 114, 128, 0.58);
  transform: translateY(-0.06mm);
}

.usePx .print-calibration__tick {
  position: absolute;
  z-index: 4;
  display: block;
  background: rgba(107, 114, 128, 0.58);
  pointer-events: none;
}

.usePx .print-calibration__tick--top,
.usePx .print-calibration__tick--bottom {
  width: 0.12mm;
  height: var(--tick-length, 8mm);
  transform: translateX(-0.06mm);
}

.usePx .print-calibration__tick--top {
  top: 0;
}

.usePx .print-calibration__tick--bottom {
  bottom: 0;
}

.usePx .print-calibration__tick--left,
.usePx .print-calibration__tick--right {
  width: var(--tick-length, 8mm);
  height: 0.12mm;
  transform: translateY(-0.06mm);
}

.usePx .print-calibration__tick--left {
  left: 0;
}

.usePx .print-calibration__tick--right {
  right: 0;
}

.usePx .print-calibration__tick--medium {
  background: rgba(107, 114, 128, 0.58);
}

.usePx .print-calibration__tick--major {
  background: rgba(107, 114, 128, 0.58);
}

.usePx .print-calibration__tick--top.print-calibration__tick--medium,
.usePx .print-calibration__tick--bottom.print-calibration__tick--medium {
  width: 0.12mm;
  transform: translateX(-0.06mm);
}

.usePx .print-calibration__tick--top.print-calibration__tick--major,
.usePx .print-calibration__tick--bottom.print-calibration__tick--major {
  width: 0.12mm;
  transform: translateX(-0.06mm);
}

.usePx .print-calibration__tick--left.print-calibration__tick--medium,
.usePx .print-calibration__tick--right.print-calibration__tick--medium {
  height: 0.12mm;
  transform: translateY(-0.06mm);
}

.usePx .print-calibration__tick--left.print-calibration__tick--major,
.usePx .print-calibration__tick--right.print-calibration__tick--major {
  height: 0.12mm;
  transform: translateY(-0.06mm);
}

.usePx .print-calibration__label {
  position: absolute;
  z-index: 5;
  min-width: 6mm;
  color: rgba(75, 85, 99, 0.92);
  font-size: 2.2mm;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
  white-space: nowrap;
}

.usePx .print-calibration__ruler {
  position: absolute;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(75, 85, 99, 0.92);
  font-size: 2.8mm;
  font-weight: 800;
  line-height: 1;
  pointer-events: none;
}

.usePx .print-calibration__ruler--horizontal {
  top: 118mm;
  left: 55mm;
  width: 100mm;
  height: 9mm;
  border-top: 0.12mm solid rgba(107, 114, 128, 0.58);
  border-right: 0.12mm solid rgba(107, 114, 128, 0.58);
  border-left: 0.12mm solid rgba(107, 114, 128, 0.58);
}

.usePx .print-calibration__ruler--horizontal span {
  margin-top: 2.6mm;
}

.usePx .print-calibration__ruler--vertical {
  top: 98.5mm;
  left: 162mm;
  width: 9mm;
  height: 100mm;
  border-top: 0.12mm solid rgba(107, 114, 128, 0.58);
  border-bottom: 0.12mm solid rgba(107, 114, 128, 0.58);
  border-left: 0.12mm solid rgba(107, 114, 128, 0.58);
}

.usePx .print-calibration__ruler--vertical span {
  display: block;
  width: 40mm;
  text-align: center;
  transform: rotate(90deg);
}

.usePx .print-calibration__summary {
  position: absolute;
  top: 136.5mm;
  left: 55mm;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2mm;
  width: 72mm;
  padding: 4mm 5mm;
  box-sizing: border-box;
  border: 0.12mm solid rgba(107, 114, 128, 0.58);
  background: rgba(255, 255, 255, 0.92);
  color: rgba(75, 85, 99, 0.92);
  font-size: 3mm;
  font-weight: 700;
  line-height: 1;
  text-align: center;
  pointer-events: none;
}

.usePx .print-calibration__summary strong {
  font-size: 4mm;
  line-height: 1.1;
}

.usePx .upload-material {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #ffffff;
}

.usePx .upload-slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: #ffffff;
  cursor: pointer;
}

.usePx .upload-slot--active {
  box-shadow: inset 0 0 0 0.45mm rgba(242, 163, 58, 0.78);
}

.usePx .paper-sheet--exporting .upload-slot,
.usePx .paper-sheet--exporting .upload-slot--active {
  outline: none;
  box-shadow: none;
}

.usePx
  .paper-sheet[data-material-key="a4-landscape-four"].paper-sheet--exporting {
  border: 0 !important;
  outline: none !important;
}

.usePx
  .paper-sheet[data-material-key="a4-landscape-four"].paper-sheet--exporting
  .upload-material,
.usePx
  .paper-sheet[data-material-key="a4-landscape-four"].paper-sheet--exporting
  .upload-slot {
  border: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}

.usePx .upload-slot__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center;
}

.usePx .upload-slot__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 0.35mm dashed rgba(17, 24, 39, 0.22);
  background:
    linear-gradient(45deg, rgba(17, 24, 39, 0.035) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(17, 24, 39, 0.035) 25%, transparent 25%),
    #ffffff;
  background-position:
    0 0,
    0 6mm;
  background-size: 12mm 12mm;
  color: rgba(17, 24, 39, 0.56);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
}

.usePx .cut-mark {
  position: absolute;
  z-index: 5;
  display: block;
  background: rgba(107, 114, 128, 0.58);
  pointer-events: none;
}

.usePx .cut-mark--top,
.usePx .cut-mark--bottom {
  width: 0.12mm;
  height: 8mm;
  transform: translateX(-0.06mm);
}

.usePx .cut-mark--bottom {
  transform: translate(-0.06mm, -8mm);
}

.usePx .cut-mark--left,
.usePx .cut-mark--right {
  width: 8mm;
  height: 0.12mm;
  transform: translateY(-0.06mm);
}

.usePx .cut-mark--right {
  transform: translate(-8mm, -0.06mm);
}

.usePx .cut-mark--center-horizontal {
  width: 6mm;
  height: 0.12mm;
  transform: translate(-3mm, -0.06mm);
}

.usePx .cut-mark--center-vertical {
  width: 0.12mm;
  height: 6mm;
  transform: translate(-0.06mm, -3mm);
}

.usePx .file-input {
  position: fixed;
  width: 1px;
  height: 1px;
  opacity: 0;
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 100%;
  max-height: 100%;
}

.usePx .image-preview__img {
  display: block;
  max-width: min(90vw, 920px);
  max-height: 78vh;
  border-radius: 8px;
  background: #ffffff;
  object-fit: contain;
  object-position: center center;
  -webkit-touch-callout: default;
  user-select: auto;
}

.usePx .image-preview__close {
  position: absolute;
  top: -14px;
  right: -14px;
  z-index: 2;
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

.usePx .image-preview__download {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #ffffff;
  color: #11131f;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.usePx .crop-modal {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  box-sizing: border-box;
  background: rgba(5, 5, 8, 0.88);
}

.usePx .crop-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(92vw, 760px);
  max-height: 92vh;
  padding: 16px;
  overflow: hidden;
  box-sizing: border-box;
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  background: #11131f;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.46);
}

.usePx .crop-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.usePx .crop-editor__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
}

.usePx .crop-editor__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
  cursor: pointer;
}

.usePx .crop-editor__icon {
  color: currentColor;
}

.usePx .crop-workspace {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  width: min(86vw, 760px);
  height: min(62vh, 560px);
  overflow: hidden;
  border-radius: 12px;
  background: #070812;
}

.usePx .crop-frame {
  position: relative;
  width: min(82vw, 720px, calc(62vh * var(--crop-ratio, 1)));
  max-width: calc(100% - 56px);
  max-height: calc(100% - 56px);
  overflow: visible;
  background: transparent;
  cursor: grab;
  outline: 2px solid rgba(255, 255, 255, 0.94);
  outline-offset: -1px;
  touch-action: none;
  user-select: none;
}

.usePx .crop-frame::before {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: block;
  box-shadow: 0 0 0 2000px rgba(5, 5, 8, 0.58);
  content: "";
  pointer-events: none;
}

.usePx .crop-frame:active {
  cursor: grabbing;
}

.usePx .crop-frame__image {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 1;
  max-width: none;
  max-height: none;
  pointer-events: none;
  user-select: none;
  transform-origin: center center;
  will-change: transform;
}

.usePx .crop-frame__grid {
  position: absolute;
  z-index: 3;
  display: block;
  background: rgba(255, 255, 255, 0.58);
  pointer-events: none;
}

.usePx .crop-frame__grid--v1,
.usePx .crop-frame__grid--v2 {
  top: 0;
  bottom: 0;
  width: 1px;
}

.usePx .crop-frame__grid--v1 {
  left: 33.333%;
}

.usePx .crop-frame__grid--v2 {
  left: 66.666%;
}

.usePx .crop-frame__grid--h1,
.usePx .crop-frame__grid--h2 {
  left: 0;
  right: 0;
  height: 1px;
}

.usePx .crop-frame__grid--h1 {
  top: 33.333%;
}

.usePx .crop-frame__grid--h2 {
  top: 66.666%;
}

.usePx .crop-zoom {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.usePx .crop-zoom__input {
  width: 100%;
  accent-color: var(--accent);
}

.usePx .crop-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.usePx .crop-editor__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 90px;
  height: 38px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.usePx .crop-editor__btn--ghost {
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
}

.usePx .crop-editor__btn--primary {
  background: var(--accent);
  color: #ffffff;
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
}

.usePx .action-btn__icon {
  color: var(--text-primary);
  line-height: 1;
}

@media print {
  @page {
    size: var(--materials-print-width, 148mm) var(--materials-print-height, 105mm);
    margin: 0;
  }

  :global(html),
  :global(body),
  :global(#app) {
    width: var(--materials-print-width, 148mm) !important;
    height: var(--materials-print-height, 105mm) !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden !important;
  }

  :global(body) {
    margin: 0;
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

  .usePx.materials-page {
    position: relative;
    inset: auto;
    display: block;
    width: var(--materials-print-width, 148mm) !important;
    height: var(--materials-print-height, 105mm) !important;
    padding: 0;
    overflow: hidden;
    background: #ffffff;
  }

  .usePx .materials-main,
  .usePx .paper-stage {
    display: block;
    width: var(--materials-print-width, 148mm) !important;
    height: var(--materials-print-height, 105mm) !important;
    margin: 0;
    overflow: hidden;
  }

  .usePx .material-tabs,
  .usePx .floating-actions,
  .usePx .crop-modal,
  .usePx .image-preview {
    display: none !important;
  }

  .usePx .paper-sheet {
    position: relative;
    top: auto;
    left: auto;
    width: var(--materials-print-width, 148mm) !important;
    height: var(--materials-print-height, 105mm) !important;
    max-height: none;
    box-shadow: none;
  }

  .usePx .upload-slot {
    border: 0 !important;
    outline: none !important;
    box-shadow: none !important;
    appearance: none;
    -webkit-appearance: none;
  }

  .usePx .paper-sheet[data-material-key="a4-landscape-four"] {
    border: 0 !important;
    outline: none !important;
  }

  .usePx .paper-sheet[data-material-key="a4-landscape-four"] .upload-material,
  .usePx .paper-sheet[data-material-key="a4-landscape-four"] .upload-slot {
    border: 0 !important;
    outline: none !important;
    box-shadow: none !important;
  }

  .usePx .upload-slot--active {
    outline: none !important;
    box-shadow: none !important;
  }

  .usePx .upload-slot__placeholder {
    display: none;
  }
}
</style>

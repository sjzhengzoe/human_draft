<template>
  <div class="page">
    <Header />
    <main class="page__main">
      <Card />
    </main>

    <div class="floating-actions">
      <button
        type="button"
        class="action-btn"
        @click="handlePasteContent"
        title="粘贴文案"
      >
        <Clipboard class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        @click="openCopyModePicker"
        title="复制文案"
      >
        <Copy class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        @click="openEditModal"
        title="编辑文案"
      >
        <Pencil class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        @click="handlePreviewImage"
        :disabled="isDownloading"
        title="预览图片"
      >
        <Eye class="action-btn__icon" :size="22" />
      </button>
      <button
        type="button"
        class="action-btn"
        @click="handleDownloadImages"
        :disabled="isDownloading"
        title="下载图片"
      >
        <Download class="action-btn__icon" :size="22" />
      </button>
    </div>

    <div v-if="copyToastVisible" class="copy-toast">复制成功</div>

    <div
      v-if="copyModePickerVisible"
      class="copy-mode"
      @click="closeCopyModePicker"
    >
      <div class="copy-mode__panel" @click.stop>
        <button
          type="button"
          class="copy-mode__btn"
          @click="handleCopyContent('xiaohongshu')"
        >
          复制小红书
        </button>
        <button
          type="button"
          class="copy-mode__btn"
          @click="handleCopyContent('douyin')"
        >
          复制抖音版
        </button>
      </div>
    </div>

    <div
      v-if="imagePreviewUrls.length"
      class="image-preview"
      @click="closeImagePreview"
    >
      <div class="image-preview__content" @click.stop>
        <Swiper
          :modules="previewModules"
          :slides-per-view="1"
          :space-between="16"
          :speed="300"
          :touch-ratio="1"
          class="image-preview__swiper"
        >
          <SwiperSlide
            v-for="(url, index) in imagePreviewUrls"
            :key="url"
            class="image-preview__slide"
          >
            <img
              class="image-preview__img"
              :src="url"
              :alt="`图片预览 ${index + 1}`"
            />
          </SwiperSlide>
        </Swiper>
      </div>
    </div>

    <div v-if="showEditModal" class="edit-modal" @click="closeEditModal">
      <div class="edit-modal__content" @click.stop>
        <div class="edit-modal__header">
          <h3 class="edit-modal__title">编辑文案</h3>
          <button class="edit-modal__close" @click="closeEditModal">×</button>
        </div>
        <form class="edit-form" @submit.prevent>
          <div class="form-item">
            <div class="form-label-row">
              <label class="form-label">内容</label>
              <button
                type="button"
                class="btn btn-text"
                @click="editFormData.content = ''"
              >
                清空
              </button>
            </div>
            <textarea
              class="form-textarea"
              v-model="editFormData.content"
              rows="6"
            />
          </div>
          <div class="form-item form-item--action">
            <button
              type="button"
              class="btn btn-primary"
              @click="handleSaveEdit"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from "vue";
import { useStore } from "./store";
import { useStore as useDouyinStore } from "@/pages/douyin/store";
import { useCommonStore } from "@/store/commonStore";
import Header from "@/components/Header.vue";
import Card from "./components/Card.vue";
import { Clipboard, Copy, Pencil, Download, Eye } from "lucide-vue-next";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import {
  convertBackgroundImagesToBase64,
  replaceSVGCSSVariables,
} from "@/utils/dataToImages";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const store = useStore();
const douyinStore = useDouyinStore();
const loadingStore = useCommonStore();
const formData = computed(() => store.formData);
const showEditModal = ref(false);
const isDownloading = ref(false);
const imagePreviewUrls = ref<string[]>([]);
const copyToastVisible = ref(false);
let copyToastTimer: ReturnType<typeof window.setTimeout> | undefined;
const IMAGE_EXPORT_WIDTH = 2880;
const XIAOHONGSHU_BLANK_LINE = "\u2800";
const XIAOHONGSHU_TAGS =
  "#日记复兴计划[话题]# #一些有感而发[话题]# #文字复兴单元[话题]# #文字[话题]# #随便记录点什么[话题]# #日常记录[话题]# #记录真实生活[话题]#";
const DOUYIN_TAGS = "#文字的力量 #记录真是生活 #思考 #讨论";
const EXPORT_VARIANTS = [
  { key: "3-4", width: 3, height: 4, theme: "default" },
  { key: "3-4-black", width: 3, height: 4, theme: "dark" },
] as const;
const previewModules: any[] = [];
type CopyMode = "xiaohongshu" | "douyin";
type ExportVariant = (typeof EXPORT_VARIANTS)[number];
type ExportedImage = {
  blob: Blob;
  fileName: string;
};

const editFormData = reactive({
  content: "",
});
const copyModePickerVisible = ref(false);

const openEditModal = () => {
  editFormData.content = formData.value.content;
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const openCopyModePicker = () => {
  copyModePickerVisible.value = true;
};

const closeCopyModePicker = () => {
  copyModePickerVisible.value = false;
};

const handleSaveEdit = () => {
  store.formData.content = editFormData.content.trim();
  store.activePageIndex = 0;
  persistAll();
  closeEditModal();
};

const handlePasteContent = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    syncPastedContent(text.trim());
  } catch (err) {
    console.error("读取剪贴板失败:", err);
  }
};

const handleCopyContent = async (mode: CopyMode) => {
  try {
    const text =
      mode === "xiaohongshu"
        ? getXiaohongshuCopyableContent(formData.value.content)
        : getDouyinCopyableContent(formData.value.content);
    if (!text) return;

    await navigator.clipboard.writeText(text);
    closeCopyModePicker();
    showCopyToast();
  } catch (err) {
    console.error("写入剪贴板失败:", err);
  }
};

const getXiaohongshuCopyableContent = (content: string) => {
  const body = getXiaohongshuCopyableBody(content);

  return [body, XIAOHONGSHU_BLANK_LINE, XIAOHONGSHU_TAGS].join("\n");
};

const getXiaohongshuCopyableBody = (content: string) => {
  const lines = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("#"));

  while (lines.length && !lines[0].trim()) {
    lines.shift();
  }

  while (lines.length && !lines[lines.length - 1].trim()) {
    lines.pop();
  }

  return lines
    .map((line) => (line.trim() ? line : XIAOHONGSHU_BLANK_LINE))
    .join("\n");
};

const getDouyinCopyableContent = (content: string) => {
  const body = getXiaohongshuCopyableBody(content);

  return [body, XIAOHONGSHU_BLANK_LINE, DOUYIN_TAGS].join("\n");
};

const showCopyToast = () => {
  copyToastVisible.value = true;
  if (copyToastTimer) {
    window.clearTimeout(copyToastTimer);
  }

  copyToastTimer = window.setTimeout(() => {
    copyToastVisible.value = false;
    copyToastTimer = undefined;
  }, 1600);
};

const closeImagePreview = () => {
  imagePreviewUrls.value.forEach((url) => URL.revokeObjectURL(url));
  imagePreviewUrls.value = [];
};

onBeforeUnmount(() => {
  closeImagePreview();
  if (copyToastTimer) {
    window.clearTimeout(copyToastTimer);
  }
  closeCopyModePicker();
});

const handlePreviewImage = async () => {
  if (isDownloading.value) return;
  isDownloading.value = true;

  loadingStore.showLoading();

  const urls: string[] = [];
  try {
    closeImagePreview();

    const images = await generatePreviewImages();
    images.forEach((image) => urls.push(URL.createObjectURL(image.blob)));

    imagePreviewUrls.value = urls;
  } catch (err) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    console.error("生成预览失败:", err);
  } finally {
    loadingStore.hideLoading();
    isDownloading.value = false;
  }
};

const handleDownloadImages = async () => {
  if (isDownloading.value) return;
  isDownloading.value = true;

  loadingStore.showLoading();

  try {
    const images = await generatePreviewImages();
    await saveImages(images);
  } catch (err) {
    console.error("下载失败:", err);
  } finally {
    loadingStore.hideLoading();
    isDownloading.value = false;
  }
};

async function generatePreviewImages() {
  await document.fonts.ready;

  const images: ExportedImage[] = [];
  const nodes: HTMLElement[] = [];

  for (let index = 0; ; index++) {
    const node = document.getElementById(`pic_${index}`) as HTMLElement | null;
    if (!node) break;

    nodes.push(node);
  }

  for (const variant of EXPORT_VARIANTS) {
    for (const [index, node] of nodes.entries()) {
      const blob = await generateImage(node, variant);
      images.push({
        blob,
        fileName: `xiaohongshu_${String(index + 1).padStart(2, "0")}_${variant.key}.png`,
      });
    }
  }

  return images;
}

async function saveImages(images: ExportedImage[]) {
  if (!images.length) return;

  const zip = new JSZip();
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);

  images.forEach((image) => {
    zip.file(image.fileName, image.blob, {
      date: localDate,
    });
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, getDownloadFileName());
}

async function generateImage(
  node: HTMLElement,
  variant: ExportVariant,
): Promise<Blob> {
  const { target, cleanup } = createExportTarget(node, variant);

  await convertBackgroundImagesToBase64(target);
  replaceSVGCSSVariables(target);
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));

  const rect = target.getBoundingClientRect();
  const scale = IMAGE_EXPORT_WIDTH / rect.width;

  try {
    const canvas = await html2canvas(target, {
      width: rect.width,
      height: rect.height,
      useCORS: true,
      scale,
      logging: false,
      backgroundColor: null,
    });

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob: Blob | null) =>
          blob ? resolve(blob) : reject(new Error("无法生成 blob")),
        "image/png",
      );
    });
  } finally {
    cleanup();
  }
}

function createExportTarget(node: HTMLElement, variant: ExportVariant) {
  const rect = node.getBoundingClientRect();
  const host = document.createElement("div");
  const target = node.cloneNode(true) as HTMLElement;
  const height = rect.width * (variant.height / variant.width);

  host.style.position = "fixed";
  host.style.top = "0";
  host.style.left = "-10000px";
  host.style.width = `${rect.width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";

  target.style.width = `${rect.width}px`;
  target.style.height = `${height}px`;
  target.style.aspectRatio = `${variant.width} / ${variant.height}`;

  if (variant.theme === "dark") {
    applyDarkExportStyle(target);
  }

  host.appendChild(target);
  document.body.appendChild(host);

  return {
    target,
    cleanup: () => host.remove(),
  };
}

function applyDarkExportStyle(target: HTMLElement) {
  target.style.background = "#050505";
  target.style.backgroundImage = "none";
  target.style.backgroundColor = "#050505";
  target.style.color = "#f7f7f7";

  target
    .querySelectorAll<HTMLElement>(
      ".sub-title, .content-body, .content-paragraph",
    )
    .forEach((element) => {
      element.style.color = "#f7f7f7";
    });
}

function getDownloadFileName() {
  const date = getContentDate(formData.value.content)
    .replace(/[^\d]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `xiaohongshu_${date}.zip`;
}

function getContentDate(content: string) {
  return (
    content
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /^\d{4}\.\d{2}\.\d{2}/.test(line)) || "flomo"
  );
}

function syncPastedContent(content: string) {
  store.formData.content = content;
  store.activePageIndex = 0;
  douyinStore.formData.content = content;
  douyinStore.activePageIndex = 0;
  persistAll();
  localStorage.setItem("DOUYIN_FORM_DATA_CONTENT", content);
}

function persistAll() {
  localStorage.setItem("XIAOHONGSHU_FORM_DATA_CONTENT", formData.value.content);
}

</script>

<style lang="less" scoped>
.page {
  display: flex;
  flex-direction: column;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 60px 16px 84px;
  padding-bottom: calc(84px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  overflow: hidden;
}

.page__main {
  flex: 1;
  margin-top: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.floating-actions {
  position: fixed;
  bottom: calc(20px + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 12px;
  z-index: 100;
  padding: 8px;
  background: rgba(17, 19, 31, 0.8);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 40px;
  border: 1px solid var(--panel-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.action-btn {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.copy-toast {
  position: fixed;
  left: 50%;
  bottom: calc(92px + env(safe-area-inset-bottom));
  z-index: 120;
  transform: translateX(-50%);
  padding: 9px 14px;
  border-radius: 999px;
  background: rgba(17, 19, 31, 0.92);
  border: 1px solid var(--panel-border);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.36);
  pointer-events: none;
}

.copy-mode {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 16px 16px calc(92px + env(safe-area-inset-bottom));
  background: rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
}

.copy-mode__panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  width: min(100%, 320px);
  padding: 8px;
  border: 1px solid var(--panel-border);
  border-radius: 18px;
  background: rgba(17, 19, 31, 0.94);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.copy-mode__btn {
  height: 42px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:active {
    background: rgba(99, 102, 241, 0.22);
  }
}

.image-preview {
  position: fixed;
  inset: 0;
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.88);
  box-sizing: border-box;
}

.image-preview__content {
  position: relative;
  width: min(100%, 460px);
  max-width: 100%;
}

.image-preview__swiper {
  width: 100%;
  max-height: 84vh;
}

.image-preview__slide {
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview__img {
  display: block;
  width: min(100%, 420px);
  max-height: 84vh;
  border-radius: 12px;
  object-fit: contain;
  -webkit-touch-callout: default;
  user-select: auto;
}

.edit-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #050508;
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  animation: fade-in 0.2s ease;
}

.edit-modal__content {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  background: #11131f;
  border-radius: 20px 20px 0 0;
  padding: 20px;
  box-sizing: border-box;
  overflow-y: auto;
  animation: slide-up 0.3s ease;
}

.edit-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.edit-modal__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.edit-modal__close {
  width: 32px;
  height: 32px;
  border: none;
  background: var(--input-bg);
  color: var(--text-secondary);
  font-size: 20px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;

  &:hover {
    background: var(--input-border);
    color: var(--text-primary);
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

.form-item {
  margin-bottom: 14px;
}
.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.form-label-row .form-label {
  margin-bottom: 0;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 12px 14px;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-primary);
  font-family: inherit;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-muted);
  }
  &:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
  }
}

.form-textarea {
  resize: vertical;
  min-height: 120px;
  line-height: 1.6;
}

.form-item--action {
  margin-top: 8px;
  margin-bottom: 0;
  .btn-primary {
    width: 100%;
    padding: 14px;
    font-size: 16px;
    font-weight: 600;
  }
}

.btn {
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;

  &.btn-primary {
    color: #fff;
    background: var(--accent);
    &:hover {
      background: var(--accent-hover);
    }
  }
  &.btn-text {
    padding: 4px 8px;
    font-size: 12px;
    color: var(--text-muted);
    background: transparent;
    &:hover {
      color: var(--text-secondary);
    }
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
</style>

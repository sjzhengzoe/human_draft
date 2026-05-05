<template>
  <div class="page">
    <Header />
    <main class="page__main">
      <section class="workspace-panel">
        <div class="workspace-panel__meta">当前功能区</div>
        <h1 class="workspace-panel__title">小红书模板</h1>
      </section>
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
        <Download class="action-btn__icon" :size="22" />
      </button>
    </div>

    <div
      v-if="imagePreviewUrls.length"
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
import { useCommonStore } from "@/store/commonStore";
import Header from "@/components/Header.vue";
import Card from "./components/Card.vue";
import { Clipboard, Pencil, Download } from "lucide-vue-next";
import { Swiper, SwiperSlide } from "swiper/vue";
import "swiper/css";
import {
  convertBackgroundImagesToBase64,
  replaceSVGCSSVariables,
} from "@/utils/dataToImages";
import html2canvas from "html2canvas";

const store = useStore();
const loadingStore = useCommonStore();
const formData = computed(() => store.formData);
const showEditModal = ref(false);
const isDownloading = ref(false);
const imagePreviewUrls = ref<string[]>([]);
const IMAGE_EXPORT_WIDTH = 2160;
const previewModules: any[] = [];

const editFormData = reactive({
  content: "",
});

const openEditModal = () => {
  editFormData.content = formData.value.content;
  showEditModal.value = true;
};

const closeEditModal = () => {
  showEditModal.value = false;
};

const handleSaveEdit = () => {
  store.formData.content = editFormData.content.trim();
  persistAll();
  closeEditModal();
};

const handlePasteContent = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    store.formData.content = text.trim();
    persistAll();
  } catch (err) {
    console.error("读取剪贴板失败:", err);
  }
};

const closeImagePreview = () => {
  imagePreviewUrls.value.forEach((url) => URL.revokeObjectURL(url));
  imagePreviewUrls.value = [];
};

onBeforeUnmount(closeImagePreview);

const handlePreviewImage = async () => {
  if (isDownloading.value) return;
  isDownloading.value = true;

  loadingStore.showLoading();

  const urls: string[] = [];
  try {
    await document.fonts.ready;
    closeImagePreview();

    let index = 0;
    while (true) {
      const node = document.getElementById(`pic_${index}`);
      if (!node) break;

      const blob = await generateImage(node);
      urls.push(URL.createObjectURL(blob));
      index++;
    }

    imagePreviewUrls.value = urls;
  } catch (err) {
    urls.forEach((url) => URL.revokeObjectURL(url));
    console.error("生成预览失败:", err);
  } finally {
    loadingStore.hideLoading();
    isDownloading.value = false;
  }
};

async function generateImage(node: HTMLElement): Promise<Blob> {
  await convertBackgroundImagesToBase64(node);
  replaceSVGCSSVariables(node);
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));

  const rect = node.getBoundingClientRect();
  const scale = IMAGE_EXPORT_WIDTH / rect.width;
  const canvas = await html2canvas(node, {
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
  margin-top: 20px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.workspace-panel {
  width: min(300px, 100%);
  margin: 0 auto 14px;
}

.workspace-panel__meta {
  margin-bottom: 4px;
  font-size: 11px;
  line-height: 1;
  color: var(--text-muted);
}

.workspace-panel__title {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
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

.image-preview__close {
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

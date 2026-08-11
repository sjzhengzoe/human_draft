import { UI_COLORS } from "../../styles/colors";

Component({
  data: {
    themeColors: UI_COLORS,
    imageDisplayStyles: [] as string[],
    measuredImageUrls: [] as string[],
    latestRenderedImageUrl: "",
    latestRenderedImageIndex: 0,
  },

  properties: {
    embedded: { type: Boolean, value: false },
    activeTemplate: { type: String, value: "xiaohongshu" },
    disabled: { type: Boolean, value: false },
    isExampleContent: { type: Boolean, value: false },
    hasCustomContent: { type: Boolean, value: false },
    renderedImageUrls: { type: Array, value: [] },
    activeIndex: { type: Number, value: 0 },
    renderError: { type: Boolean, value: false },
    renderErrorMessage: { type: String, value: "预览生成失败" },
    isRenderingCards: { type: Boolean, value: false },
    renderProgressText: { type: String, value: "" },
    contentCount: { type: Number, value: 0 },
    previewCount: { type: Number, value: 0 },
    mergeStartIndex: { type: Number, value: -1 },
    fitAdaptiveImages: { type: Boolean, value: false },
    progressiveRendering: { type: Boolean, value: false },
    exportReady: { type: Boolean, value: false },
    actionLabel: { type: String, value: "图文创作操作" },
    showAppend: { type: Boolean, value: false },
    showClearUndo: { type: Boolean, value: false },
    variant: { type: String, value: "default" },
    showCircleImagePicker: { type: Boolean, value: false },
    selectedImagePaths: { type: Array, value: [] },
    selectingImage: { type: Boolean, value: false },
    selectingImageIndex: { type: Number, value: -1 },
  },

  observers: {
    renderedImageUrls(renderedImageUrls: unknown[]) {
      const urls = Array.isArray(renderedImageUrls)
        ? renderedImageUrls.map((url) => String(url || ""))
        : [];
      const imageDisplayStyles = urls.map((url, index) =>
        url === this.data.measuredImageUrls[index]
          ? this.data.imageDisplayStyles[index] || ""
          : "",
      );
      const latestRenderedImageIndex = Math.max(0, urls.length - 1);
      this.setData({
        imageDisplayStyles,
        measuredImageUrls: urls,
        latestRenderedImageUrl: urls[latestRenderedImageIndex] || "",
        latestRenderedImageIndex,
      });
    },
  },

  methods: {
    handleCopyTemplate() {
      this.triggerEvent("copytemplate");
    },

    handleSwiperChange(event: WechatMiniprogram.SwiperChange) {
      this.triggerEvent("swiperchange", event.detail);
    },

    handleRetryPreview() {
      this.triggerEvent("retrypreview");
    },

    handleCardImageLoad(
      event: WechatMiniprogram.CustomEvent<{ width?: number; height?: number }>,
    ) {
      const index = Number(event.currentTarget.dataset.index);
      const url = String(event.currentTarget.dataset.url || "");
      const notifyLoaded = () => {
        this.triggerEvent("previewimageload", { index, url });
      };
      if (!this.properties.fitAdaptiveImages) {
        notifyLoaded();
        return;
      }
      const width = Number(event.detail.width) || 0;
      const height = Number(event.detail.height) || 0;
      if (!Number.isInteger(index) || index < 0 || width <= 0 || height <= 0) {
        notifyLoaded();
        return;
      }

      const aspectRatio = height / width;
      const widthScale = Math.min(1, 4 / (3 * aspectRatio));
      const displayStyle = [
        `--card-item-width: ${Math.round(600 * widthScale)}rpx`,
        `--card-item-compact-width: ${Math.round(520 * widthScale)}rpx`,
      ].join("; ");
      if (this.data.imageDisplayStyles[index] === displayStyle) {
        notifyLoaded();
        return;
      }
      const imageDisplayStyles = [...this.data.imageDisplayStyles];
      imageDisplayStyles[index] = displayStyle;
      this.setData({ imageDisplayStyles }, notifyLoaded);
    },

    handleAction(event: WechatMiniprogram.CustomEvent<{ key?: string }>) {
      this.triggerEvent("action", event.detail);
    },

    handleUndoClear() {
      this.triggerEvent("undoclear");
    },

    handleChooseCircleImage(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;
      this.triggerEvent("choosecircleimage", { index });
    },
  },
});

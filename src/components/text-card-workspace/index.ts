Component({
  data: {
    templates: [
      { key: "xiaohongshu", label: "模板一" },
      { key: "douyin2", label: "模板二" },
      { key: "douyin3", label: "模板三" },
    ],
  },

  properties: {
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

  methods: {
    handleTemplateTap(event: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled) return;
      const template = event.currentTarget.dataset.template;
      if (!template || template === this.data.activeTemplate) return;
      this.triggerEvent("templatechange", { template });
    },

    handleCopyTemplate() {
      this.triggerEvent("copytemplate");
    },

    handleSwiperChange(event: WechatMiniprogram.SwiperChange) {
      this.triggerEvent("swiperchange", event.detail);
    },

    handleRetryPreview() {
      this.triggerEvent("retrypreview");
    },

    handleAction(event: WechatMiniprogram.CustomEvent<{ key?: string }>) {
      this.triggerEvent("action", event.detail);
    },

    handleUndoClear() {
      this.triggerEvent("undoclear");
    },

    handleNavigationBack() {
      this.triggerEvent("navigationback");
    },

    handleChooseCircleImage(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index);
      if (!Number.isInteger(index) || index < 0) return;
      this.triggerEvent("choosecircleimage", { index });
    },
  },
});

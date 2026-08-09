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
  },

  methods: {
    handleTap(event: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled) return;
      const template = event.currentTarget.dataset.template;
      if (!template || template === this.data.activeTemplate) return;
      this.triggerEvent("change", { template });
    },
  },
});

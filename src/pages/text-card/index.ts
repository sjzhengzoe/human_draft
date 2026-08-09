type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

Component({
  data: {
    activeTemplate: "xiaohongshu" as TextCardTemplate,
    mountedTemplates: {
      xiaohongshu: true,
      douyin2: false,
      douyin3: false,
    },
  },

  methods: {
    handleTemplateChange(
      event: WechatMiniprogram.CustomEvent<{ template?: string }>,
    ) {
      const template = normalizeTemplate(event.detail.template);
      if (!template || template === this.data.activeTemplate) return;

      this.setData({
        activeTemplate: template,
        [`mountedTemplates.${template}`]: true,
      });
    },
  },
});

function normalizeTemplate(value: unknown): TextCardTemplate | undefined {
  if (value === "xiaohongshu" || value === "douyin2" || value === "douyin3") {
    return value;
  }
  return undefined;
}

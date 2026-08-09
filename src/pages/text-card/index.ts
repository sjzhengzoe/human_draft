type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

Component({
  data: {
    templates: [
      { key: "xiaohongshu", label: "模板一" },
      { key: "douyin2", label: "模板二" },
      { key: "douyin3", label: "模板三" },
    ],
    activeTemplate: "xiaohongshu" as TextCardTemplate,
    mountedTemplates: {
      xiaohongshu: true,
      douyin2: false,
      douyin3: false,
    },
  },

  methods: {
    handleTemplateTap(event: WechatMiniprogram.TouchEvent) {
      const template = normalizeTemplate(event.currentTarget.dataset.template);
      if (!template || template === this.data.activeTemplate) return;

      const currentTemplate = this.selectComponent(
        `#text-card-template-${this.data.activeTemplate}`,
      ) as unknown as { prepareTemplateSwitch?: () => boolean };
      if (currentTemplate?.prepareTemplateSwitch?.() === false) return;

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

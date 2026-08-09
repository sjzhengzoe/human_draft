// The only full-page host for all three text-card templates.
type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3";

const LAST_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE";

Page({
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

  onLoad(query: Record<string, string | undefined>) {
    const template = normalizeTemplate(query.template);
    if (!template) return;

    wx.setStorageSync(LAST_TEMPLATE_STORAGE_KEY, template);
    if (template === "xiaohongshu") return;

    this.setData({
      activeTemplate: template,
      [`mountedTemplates.${template}`]: true,
    });
  },

  handleTemplateTap(event: WechatMiniprogram.TouchEvent) {
    const template = normalizeTemplate(event.currentTarget.dataset.template);
    if (!template || template === this.data.activeTemplate) return;

    const currentTemplate = this.selectComponent(
      `#text-card-template-${this.data.activeTemplate}`,
    ) as unknown as { prepareTemplateSwitch?: () => boolean };
    if (currentTemplate?.prepareTemplateSwitch?.() === false) return;

    wx.setStorageSync(LAST_TEMPLATE_STORAGE_KEY, template);
    this.setData({
      activeTemplate: template,
      [`mountedTemplates.${template}`]: true,
    });
  },
});

function normalizeTemplate(value: unknown): TextCardTemplate | undefined {
  if (value === "xiaohongshu" || value === "douyin2" || value === "douyin3") {
    return value;
  }
  return undefined;
}

Page({
  onLoad(query: Record<string, string | undefined>) {
    const template = normalizeCompatTemplate(query.template);
    const suffix = template ? `?template=${template}` : "";
    wx.redirectTo({ url: `/pages/xiaohongshu/index${suffix}` });
  },
});

function normalizeCompatTemplate(value: unknown) {
  if (value === "xiaohongshu" || value === "douyin2" || value === "douyin3") {
    return value;
  }
  return undefined;
}

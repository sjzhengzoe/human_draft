const EDITOR_CONFIG = {
  xiaohongshu: {
    title: "编辑文案",
    storageKey: "TEXT_CARD_CONTENT"
  },
  douyin2: {
    title: "编辑文案",
    storageKey: "TEXT_CARD_CONTENT"
  }
};
function normalizeSource(source) {
  return source === "douyin2" ? "douyin2" : "xiaohongshu";
}
Page({
  data: {
    source: "xiaohongshu",
    content: ""
  },
  onLoad(query) {
    const source = normalizeSource(query.source);
    const config = EDITOR_CONFIG[source];
    const storedContent = wx.getStorageSync(config.storageKey);
    wx.setNavigationBarTitle({
      title: config.title
    });
    this.setData({
      source,
      content: typeof storedContent === "string" ? storedContent : ""
    });
  },
  handleInput(event) {
    this.setData({
      content: event.detail.value
    });
  },
  clearContent() {
    this.setData({
      content: ""
    });
  },
  saveContent() {
    const source = this.data.source;
    const config = EDITOR_CONFIG[source];
    wx.setStorageSync(config.storageKey, this.data.content.trim());
    wx.showToast({
      title: "已保存",
      icon: "success"
    });
    setTimeout(() => {
      wx.navigateBack();
    }, 220);
  }
});

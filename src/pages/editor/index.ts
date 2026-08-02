import { checkTextContent } from "../../services/content-security"
import { initializeUIFont } from "../../services/ui-font"

type EditorSource = "xiaohongshu" | "douyin2" | "douyin3"

type EditorConfig = {
  title: string
  storageKey: string
}

const EDITOR_CONFIG: Record<EditorSource, EditorConfig> = {
  xiaohongshu: {
    title: "编辑文案",
    storageKey: "TEXT_CARD_CONTENT"
  },
  douyin2: {
    title: "编辑文案",
    storageKey: "TEXT_CARD_CONTENT"
  },
  douyin3: {
    title: "编辑文案",
    storageKey: "TEXT_CARD_CONTENT"
  }
}

function normalizeSource(source: string | undefined): EditorSource {
  return source === "douyin2" || source === "douyin3"
    ? source
    : "xiaohongshu"
}

Page({
  data: {
    source: "xiaohongshu" as EditorSource,
    content: "",
    fontReady: false,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const source = normalizeSource(query.source)
    const config = EDITOR_CONFIG[source]
    const storedContent = wx.getStorageSync(config.storageKey)

    wx.setNavigationBarTitle({
      title: config.title
    })

    this.setData({
      source,
      content: typeof storedContent === "string" ? storedContent : ""
    })

    void initializeUIFont()
      .catch((error) => {
        console.warn("编辑页通用字体加载失败，使用系统字体回退", error)
      })
      .finally(() => {
        this.setData({ fontReady: true })
      })
  },

  handleInput(event: WechatMiniprogram.Input) {
    this.setData({
      content: event.detail.value
    })
  },

  clearContent() {
    this.setData({
      content: ""
    })
  },

  async saveContent() {
    if (this.data.saving) return

    const source = this.data.source as EditorSource
    const config = EDITOR_CONFIG[source]
    const content = this.data.content.trim()

    if (content) {
      this.setData({ saving: true })
      wx.showLoading({ title: "安全检测中", mask: true })
      try {
        await checkTextContent(content)
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "内容安全检测失败",
          icon: "none"
        })
        return
      } finally {
        wx.hideLoading()
        this.setData({ saving: false })
      }
    }

    wx.setStorageSync(config.storageKey, content)
    wx.showToast({
      title: "已保存",
      icon: "success"
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 220)
  }
})

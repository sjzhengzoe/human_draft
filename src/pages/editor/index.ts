import { checkTextContent } from "../../services/content-security"
import { initializeUIFont } from "../../services/ui-font"
import { TEXT_CARD_STORAGE_KEYS } from "../../utils/text-card-storage"

type EditorSource = "xiaohongshu" | "douyin2" | "douyin3"

type EditorConfig = {
  title: string
  storageKey: string
}

type EditorDraft = {
  baseContent: string
  content: string
}

const DRAFT_STORAGE_PREFIX = "TEXT_CARD_EDITOR_DRAFT_"
const MAX_CONTENT_LENGTH = 800

const EDITOR_CONFIG: Record<EditorSource, EditorConfig> = {
  xiaohongshu: {
    title: "编辑文案",
    storageKey: TEXT_CARD_STORAGE_KEYS.xiaohongshu
  },
  douyin2: {
    title: "编辑文案",
    storageKey: TEXT_CARD_STORAGE_KEYS.douyin2
  },
  douyin3: {
    title: "编辑文案",
    storageKey: TEXT_CARD_STORAGE_KEYS.douyin3
  }
}

function normalizeSource(source: string | undefined): EditorSource {
  return source === "douyin2" || source === "douyin3"
    ? source
    : "xiaohongshu"
}

function getDraftStorageKey(source: EditorSource) {
  return `${DRAFT_STORAGE_PREFIX}${source}`
}

function getEditorDraft(value: unknown, baseContent: string) {
  if (!value || typeof value !== "object") return undefined
  const draft = value as Partial<EditorDraft>
  if (
    draft.baseContent !== baseContent ||
    typeof draft.content !== "string" ||
    draft.content === baseContent
  ) {
    return undefined
  }
  return draft.content
}

Page({
  data: {
    source: "xiaohongshu" as EditorSource,
    content: "",
    originalContent: "",
    maxContentLength: MAX_CONTENT_LENGTH,
    characterCount: 0,
    isDirty: false,
    saving: false,
    showLeaveDialog: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const source = normalizeSource(query.source)
    const config = EDITOR_CONFIG[source]
    const storedContent = wx.getStorageSync(config.storageKey)
    const originalContent = typeof storedContent === "string" ? storedContent : ""
    const restoredDraft = getEditorDraft(
      wx.getStorageSync(getDraftStorageKey(source)),
      originalContent
    )
    const content = restoredDraft ?? originalContent

    wx.setNavigationBarTitle({
      title: config.title
    })

    this.setData({
      source,
      content,
      originalContent,
      characterCount: Array.from(content).length,
      isDirty: content !== originalContent
    })

    if (restoredDraft !== undefined) {
      wx.showToast({ title: "已恢复未保存内容", icon: "none" })
    }

    void initializeUIFont()
      .catch((error) => {
        console.warn("编辑页通用字体加载失败，使用系统字体回退", error)
      })
  },

  onUnload() {
    if (!this.data.isDirty) return
    const source = this.data.source as EditorSource
    const draft: EditorDraft = {
      baseContent: this.data.originalContent,
      content: this.data.content
    }
    wx.setStorageSync(getDraftStorageKey(source), draft)
  },

  handleInput(event: WechatMiniprogram.Input) {
    const content = event.detail.value
    this.setData({
      content,
      characterCount: Array.from(content).length,
      isDirty: content !== this.data.originalContent
    })
  },

  clearContent() {
    this.setData({
      content: "",
      characterCount: 0,
      isDirty: Boolean(this.data.originalContent)
    })
  },

  handleBack() {
    if (this.data.isDirty) {
      this.setData({ showLeaveDialog: true })
      return
    }
    wx.navigateBack()
  },

  cancelLeave() {
    this.setData({ showLeaveDialog: false })
  },

  confirmLeave() {
    const source = this.data.source as EditorSource
    wx.removeStorageSync(getDraftStorageKey(source))
    this.setData({ showLeaveDialog: false, isDirty: false }, () => {
      wx.navigateBack()
    })
  },

  async saveContent() {
    if (this.data.saving) return

    const source = this.data.source as EditorSource
    const config = EDITOR_CONFIG[source]
    const content = this.data.content.trim()

    this.setData({ saving: true })

    if (content) {
      wx.showLoading({ title: "安全检测中", mask: true })
      try {
        await checkTextContent(content)
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "内容安全检测失败",
          icon: "none"
        })
        this.setData({ saving: false })
        return
      } finally {
        wx.hideLoading()
      }
    }

    wx.setStorageSync(config.storageKey, content)
    wx.removeStorageSync(getDraftStorageKey(source))
    this.setData({
      content,
      originalContent: content,
      characterCount: Array.from(content).length,
      isDirty: false
    })
    wx.showToast({
      title: "已保存",
      icon: "success"
    })

    setTimeout(() => {
      wx.navigateBack()
    }, 220)
  }
})

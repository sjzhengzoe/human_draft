import {
  createKeyMoment,
  deleteKeyMoment,
  deleteKeyMomentImage,
  listKeyMoments,
  replaceKeyMomentImage,
  updateKeyMoment
} from "../../services/key-moments"
import { ensureLogin } from "../../services/auth"
import type {
  KeyMoment,
  KeyMomentGranularity,
  KeyMomentTimelineItem
} from "../../types/key-moments"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function currentShanghaiDateTime(): { date: string; time: string } {
  const now = new Date(Date.now() + SHANGHAI_OFFSET_MS)
  return {
    date: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    time: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`
  }
}

function shanghaiParts(value: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
} {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET_MS)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  }
}

function editorDateTime(value: string): { date: string; time: string } {
  const parts = shanghaiParts(value)
  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`
  }
}

function intervalLabel(newer: string, older: string): string {
  const totalMinutes = Math.max(
    0,
    Math.floor((new Date(newer).getTime() - new Date(older).getTime()) / 60000)
  )
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  return days > 0 ? `${days}d${hours}h${minutes}m` : `${hours}h${minutes}m`
}

function toTimelineItems(items: KeyMoment[]): KeyMomentTimelineItem[] {
  return items.map((item, index) => {
    const parts = shanghaiParts(item.occurred_at)
    const previousParts = index > 0 ? shanghaiParts(items[index - 1].occurred_at) : null
    const showDateHeading =
      !previousParts ||
      previousParts.year !== parts.year ||
      previousParts.month !== parts.month ||
      previousParts.day !== parts.day
    return {
      ...item,
      date_label: `${parts.year}.${pad(parts.month)}.${pad(parts.day)}`,
      time_label: `${pad(parts.hour)}:${pad(parts.minute)}`,
      show_date_heading: showDateHeading,
      heading_day: String(parts.day),
      heading_month: `${parts.month}月`,
      heading_year: `${parts.year}年`,
      interval_after:
        index < items.length - 1
          ? intervalLabel(item.occurred_at, items[index + 1].occurred_at)
          : ""
    }
  })
}

function periodLabel(granularity: KeyMomentGranularity, date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  if (granularity === "year") return `${year}年`
  if (granularity === "month") return `${year}年${month}月`
  return `${year}年${month}月${day}日`
}

const INITIAL_DATE_TIME = currentShanghaiDateTime()

Page({
  data: {
    granularityOptions: [
      { value: "year", label: "年" },
      { value: "month", label: "月" },
      { value: "day", label: "日" }
    ],
    activeGranularity: "day" as KeyMomentGranularity,
    anchorDate: INITIAL_DATE_TIME.date,
    periodLabel: periodLabel("day", INITIAL_DATE_TIME.date),
    items: [] as KeyMomentTimelineItem[],
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    showEditor: false,
    editingId: "",
    editorContent: "",
    editorDate: INITIAL_DATE_TIME.date,
    editorTime: INITIAL_DATE_TIME.time,
    currentImageUrl: "",
    originalImageUrl: "",
    selectedImagePath: "",
    removeCurrentImage: false,
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    saving: false,
    deleting: false
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    this.loadItems()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadItems() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading
    })
    try {
      const session = await ensureLogin()
      const items = await listKeyMoments({
        granularity: this.data.activeGranularity,
        date: this.data.anchorDate
      })
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ items: toTimelineItems(items), canWrite: session.user.can_write })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "加载失败",
        icon: "none"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleGranularityTap(event: WechatMiniprogram.TouchEvent) {
    const granularity = event.currentTarget.dataset.value as KeyMomentGranularity
    if (!granularity || granularity === this.data.activeGranularity || this.data.contentLoading) return
    this.setData({
      activeGranularity: granularity,
      periodLabel: periodLabel(granularity, this.data.anchorDate)
    }, () => this.loadItems())
  },

  handleAnchorDateChange(event: WechatMiniprogram.PickerChange) {
    const date = String(event.detail.value)
    if (!date || date === this.data.anchorDate) return
    this.setData({
      anchorDate: date,
      periodLabel: periodLabel(this.data.activeGranularity, date)
    }, () => this.loadItems())
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading) return
    const now = currentShanghaiDateTime()
    this.setData({
      showEditor: true,
      editingId: "",
      editorContent: "",
      editorDate: now.date,
      editorTime: now.time,
      currentImageUrl: "",
      originalImageUrl: "",
      selectedImagePath: "",
      removeCurrentImage: false,
      selectingImage: false,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    const dateTime = editorDateTime(item.occurred_at)
    this.setData({
      showEditor: true,
      editingId: item.id,
      editorContent: item.content,
      editorDate: dateTime.date,
      editorTime: dateTime.time,
      currentImageUrl: item.image_url,
      originalImageUrl: item.image_url,
      selectedImagePath: "",
      removeCurrentImage: false,
      selectingImage: false,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleContentInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ editorContent: event.detail.value })
  },

  handleEditorDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editorDate: String(event.detail.value) })
  },

  handleEditorTimeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editorTime: String(event.detail.value) })
  },

  handleChooseImage() {
    if (this.data.saving || this.data.deleting || this.data.selectingImage) return
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const file = result.tempFiles[0]
        if (file?.tempFilePath) {
          this.setData({
            selectingImage: false,
            showImageCropper: true,
            cropSourcePath: file.tempFilePath
          })
          return
        }
        this.setData({ selectingImage: false })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleImageCropCancel() {
    if (this.data.saving || this.data.deleting) return
    this.setData({
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleImageCropConfirm(
    event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>
  ) {
    const tempFilePath = event.detail.tempFilePath
    if (!tempFilePath) return
    this.setData({
      selectedImagePath: tempFilePath,
      currentImageUrl: this.data.originalImageUrl,
      removeCurrentImage: false,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleImageCropError(
    event: WechatMiniprogram.CustomEvent<{ message?: string }>
  ) {
    wx.showToast({
      title: event.detail.message || "图片裁剪失败，请重试",
      icon: "none"
    })
  },

  handleRemoveEditorImage() {
    if (this.data.saving || this.data.deleting) return
    if (this.data.selectedImagePath) {
      this.setData({ selectedImagePath: "" })
      return
    }
    if (this.data.currentImageUrl) {
      this.setData({ currentImageUrl: "", removeCurrentImage: true })
    }
  },

  handlePreview(event: WechatMiniprogram.TouchEvent) {
    const url = String(event.currentTarget.dataset.url || "")
    if (url) wx.previewImage({ current: url, urls: [url] })
  },

  closeEditor() {
    if (!this.data.saving && !this.data.deleting) this.setData({ showEditor: false })
  },

  noop() {},

  async saveEditor() {
    if (this.data.saving || this.data.deleting || this.data.selectingImage) return
    const content = this.data.editorContent.trim()
    const hasImage = Boolean(this.data.selectedImagePath || this.data.currentImageUrl)
    if (!content && !hasImage) {
      wx.showToast({ title: "请填写文案或上传图片", icon: "none" })
      return
    }
    const occurredAt = `${this.data.editorDate}T${this.data.editorTime}:00+08:00`
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.editingId) {
        await updateKeyMoment(this.data.editingId, { content, occurredAt })
        if (this.data.selectedImagePath) {
          await replaceKeyMomentImage(this.data.editingId, this.data.selectedImagePath)
        } else if (this.data.removeCurrentImage) {
          await deleteKeyMomentImage(this.data.editingId)
        }
      } else {
        await createKeyMoment({
          content,
          occurredAt,
          imagePath: this.data.selectedImagePath || undefined
        })
      }
      if (!isAsyncPageActive(this)) return
      this.setData({
        showEditor: false,
        anchorDate: this.data.editorDate,
        periodLabel: periodLabel(this.data.activeGranularity, this.data.editorDate)
      })
      wx.showToast({ title: "已保存", icon: "success" })
      await this.loadItems()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none",
          duration: 2600
        })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete() {
    if (!this.data.editingId || this.data.saving || this.data.deleting) return
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除关键节点",
      content: "删除后，图片和文案都无法恢复。",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!isAsyncPageActive(this)) return
        if (!result.confirm) {
          this.setData({ deleting: false })
          return
        }
        wx.showLoading({ title: "删除中", mask: true })
        try {
          await deleteKeyMoment(this.data.editingId)
          if (!isAsyncPageActive(this)) return
          this.setData({ showEditor: false })
          wx.showToast({ title: "已删除", icon: "success" })
          await this.loadItems()
        } catch (error) {
          if (isAsyncPageActive(this)) {
            wx.showToast({
              title: error instanceof Error ? error.message : "删除失败",
              icon: "none"
            })
          }
        } finally {
          wx.hideLoading()
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ deleting: false })
      }
    })
  }
})

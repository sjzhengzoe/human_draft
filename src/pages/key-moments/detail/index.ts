import { deleteKeyMoment, listKeyMomentFeed } from "../../../services/key-moments"
import { ensureLogin } from "../../../services/auth"
import type { KeyMoment, KeyMomentDetailItem } from "../../../types/key-moments"
import {
  activateAsyncPage,
  deactivateAsyncPage,
  isAsyncPageActive
} from "../../../utils/async-page"
import { getKeyMomentDataRevision } from "../../../utils/key-moment-data-cache"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function detailDateParts(value: string) {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET_MS)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  const hour = date.getUTCHours()
  const minute = date.getUTCMinutes()
  return {
    editorDate: `${year}-${pad(month)}-${pad(day)}`,
    dateLabel: `${year}年${month}月${day}日`,
    timeLabel: `${pad(hour)}:${pad(minute)}`
  }
}

function toDetailItems(items: KeyMoment[]): KeyMomentDetailItem[] {
  return items.map((item) => {
    const labels = detailDateParts(item.occurred_at)
    return {
      ...item,
      date_label: labels.dateLabel,
      time_label: labels.timeLabel,
      single_image_style: ""
    }
  })
}

Page({
  data: {
    loading: true,
    items: [] as KeyMomentDetailItem[],
    swiperCurrent: 0,
    requestedId: "",
    anchorDate: "",
    canWrite: false,
    dataRevision: -1,
    showDeleteConfirm: false,
    deleting: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const requestedId = String(query.id || "")
    const anchorDate = String(query.date || "")
    this.setData({ requestedId, anchorDate })
    void this.loadFeed(requestedId)
  },

  onShow() {
    if (!this.data.loading && this.data.dataRevision !== getKeyMomentDataRevision()) {
      const currentId = this.data.items[this.data.swiperCurrent]?.id || this.data.requestedId
      void this.loadFeed(currentId, true)
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadFeed(focusId: string, background = false) {
    if (!this.data.anchorDate) return
    if (!background) this.setData({ loading: true })
    try {
      const session = await ensureLogin()
      const items = toDetailItems(await listKeyMomentFeed(this.data.anchorDate))
      if (!isAsyncPageActive(this)) return
      const focusIndex = Math.max(0, items.findIndex((item) => item.id === focusId))
      this.setData({
        items,
        swiperCurrent: focusIndex,
        canWrite: session.user.can_write,
        dataRevision: getKeyMomentDataRevision(),
        loading: false
      })
    } catch (error) {
      if (!isAsyncPageActive(this)) return
      this.setData({ loading: false })
      wx.showToast({
        title: error instanceof Error ? error.message : "详情加载失败",
        icon: "none"
      })
    }
  },

  handleBack() {
    wx.navigateBack()
  },

  handleSwiperChange(event: WechatMiniprogram.CustomEvent<{ current: number }>) {
    this.setData({ swiperCurrent: Number(event.detail.current || 0) })
  },

  handlePreview(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    const current = String(event.currentTarget.dataset.url || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (current && item?.image_urls.length) {
      wx.previewImage({ current, urls: item.image_urls })
    }
  },

  handleSingleImageLoad(
    event: WechatMiniprogram.CustomEvent<{ width?: number; height?: number }>
  ) {
    const itemIndex = Number(event.currentTarget.dataset.itemIndex)
    const item = this.data.items[itemIndex]
    if (!item || item.image_count !== 1) return
    const sourceWidth = Number(event.detail.width) || 0
    const sourceHeight = Number(event.detail.height) || 0
    if (sourceWidth <= 0 || sourceHeight <= 0) return

    const maxEdge = 480
    const sourceRatio = sourceHeight / sourceWidth
    const displayRatio = Math.min(1.5, Math.max(2 / 3, sourceRatio))
    const width = displayRatio >= 1 ? Math.round(maxEdge / displayRatio) : maxEdge
    const height = displayRatio >= 1 ? maxEdge : Math.round(maxEdge * displayRatio)
    const singleImageStyle = `width: ${width}rpx; height: ${height}rpx;`
    if (item.single_image_style === singleImageStyle) return
    this.setData({ [`items[${itemIndex}].single_image_style`]: singleImageStyle })
  },

  handleEdit() {
    if (!this.data.canWrite || this.data.deleting) return
    const item = this.data.items[this.data.swiperCurrent]
    if (!item) return
    const date = detailDateParts(item.occurred_at).editorDate
    wx.navigateTo({
      url: `/pages/key-moments/edit/index?id=${encodeURIComponent(item.id)}&date=${date}`
    })
  },

  handleDelete() {
    if (!this.data.canWrite || this.data.deleting) return
    const item = this.data.items[this.data.swiperCurrent]
    if (!item) return
    this.setData({ showDeleteConfirm: true })
  },

  handleDeleteConfirmCancel() {
    if (this.data.deleting) return
    this.setData({ showDeleteConfirm: false })
  },

  async handleDeleteConfirm() {
    if (this.data.deleting) return
    const item = this.data.items[this.data.swiperCurrent]
    if (!item) return
    let deleted = false
    this.setData({ deleting: true })
    wx.showLoading({ title: "删除中", mask: true })
    try {
      await deleteKeyMoment(item.id)
      if (!isAsyncPageActive(this)) return
      this.setData({ showDeleteConfirm: false })
      deleted = true
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ showDeleteConfirm: false })
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
    if (deleted && isAsyncPageActive(this)) {
      wx.showToast({ title: "已删除", icon: "success" })
      wx.navigateBack()
    }
  }
})

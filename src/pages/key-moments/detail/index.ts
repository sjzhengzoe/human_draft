import { listKeyMomentFeed } from "../../../services/key-moments"
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
  return items.map((item, index) => {
    const labels = detailDateParts(item.occurred_at)
    return {
      ...item,
      date_label: labels.dateLabel,
      time_label: labels.timeLabel,
      position_label: `${index + 1} / ${items.length}`
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
    dataRevision: -1
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

  handleEdit() {
    if (!this.data.canWrite) return
    const item = this.data.items[this.data.swiperCurrent]
    if (!item) return
    const date = detailDateParts(item.occurred_at).editorDate
    wx.navigateTo({
      url: `/pages/key-moments/edit/index?id=${encodeURIComponent(item.id)}&date=${date}`
    })
  }
})

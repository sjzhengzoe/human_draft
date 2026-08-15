import {
  deleteKeyMoment,
  getKeyMomentContext,
  listKeyMomentFeed
} from "../services/key-moments"
import { ensureLogin } from "../../../services/auth"
import type { KeyMoment, KeyMomentDetailItem } from "../../../types/key-moments"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { getKeyMomentDataRevision } from "../../../utils/key-moment-data-cache"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
let feedLoadSequence = 0

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
    canWrite: false,
    dataRevision: -1,
    showDeleteConfirm: false,
    deleting: false,
    loadError: "",
    loadingDirection: "" as "" | "newer" | "older",
    newerCursor: "",
    olderCursor: "",
    hasNewer: false,
    hasOlder: false
  },

  onLoad(query: Record<string, string | undefined>) {
    feedLoadSequence += 1
    activateAsyncPage(this)
    const requestedId = String(query.id || "")
    this.setData({ requestedId })
    void this.loadContext(requestedId)
  },

  onShow() {
    if (!this.data.loading && this.data.dataRevision !== getKeyMomentDataRevision()) {
      const currentId = this.data.items[this.data.swiperCurrent]?.id || this.data.requestedId
      void this.loadContext(currentId, true)
    }
  },

  onUnload() {
    feedLoadSequence += 1
    deactivateAsyncPage(this)
  },

  async loadContext(focusId: string, background = false) {
    if (!focusId) return
    feedLoadSequence += 1
    const generation = beginAsyncPageRequest(this)
    this.setData({
      loadingDirection: "",
      ...(!background ? { loading: true, loadError: "" } : {})
    })
    try {
      const session = await ensureLogin()
      const context = await getKeyMomentContext(focusId)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        items: toDetailItems(context.items),
        swiperCurrent: context.focus_index,
        canWrite: session.user.can_write,
        dataRevision: getKeyMomentDataRevision(),
        loading: false,
        loadError: "",
        hasNewer: context.has_newer,
        hasOlder: context.has_older,
        newerCursor: context.newer_cursor,
        olderCursor: context.older_cursor
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "详情加载失败"
      if (!background || !this.data.items.length) {
        this.setData({ loading: false, loadError: message })
      } else {
        wx.showToast({ title: message, icon: "none" })
      }
    }
  },

  handleRetry() {
    if (this.data.loading) return
    void this.loadContext(this.data.requestedId)
  },

  handleBack() {
    wx.navigateBack()
  },

  handleSwiperChange(event: WechatMiniprogram.CustomEvent<{ current: number }>) {
    const swiperCurrent = Number(event.detail.current || 0)
    this.setData({ swiperCurrent })
    if (swiperCurrent <= 1 && this.data.hasNewer) {
      void this.loadMore("newer")
    } else if (swiperCurrent >= this.data.items.length - 2 && this.data.hasOlder) {
      void this.loadMore("older")
    }
  },

  async loadMore(direction: "newer" | "older") {
    if (this.data.loadingDirection) return
    const cursor = direction === "newer" ? this.data.newerCursor : this.data.olderCursor
    if (!cursor) return
    const sequence = ++feedLoadSequence
    this.setData({ loadingDirection: direction })
    try {
      const page = await listKeyMomentFeed({ cursor, direction })
      if (!isAsyncPageActive(this) || sequence !== feedLoadSequence) return
      const knownIds = new Set(this.data.items.map((item) => item.id))
      const added = toDetailItems(page.items.filter((item) => !knownIds.has(item.id)))
      if (direction === "newer") {
        this.setData({
          items: [...added, ...this.data.items],
          swiperCurrent: this.data.swiperCurrent + added.length,
          newerCursor: page.next_cursor,
          hasNewer: page.has_more
        })
      } else {
        this.setData({
          items: [...this.data.items, ...added],
          olderCursor: page.next_cursor,
          hasOlder: page.has_more
        })
      }
    } catch (error) {
      if (isAsyncPageActive(this) && sequence === feedLoadSequence) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载更多失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this) && sequence === feedLoadSequence) {
        this.setData({ loadingDirection: "" })
      }
    }
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
    wx.navigateTo({
      url: `/pages/key-moments/edit/index?id=${encodeURIComponent(item.id)}`
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

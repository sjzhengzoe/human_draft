import {
  deleteKeyMoment,
  listKeyMoments
} from "../../services/key-moments"
import { ensureLogin, getCurrentUser } from "../../services/auth"
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
import { requireLoginForAction } from "../../utils/login-required"
import {
  getCachedKeyMoments,
  getKeyMomentDataRevision
} from "../../utils/key-moment-data-cache"

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
    guestMode: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    keyMomentRevision: -1,
    timelineScrollAnchor: "",
    showDeleteConfirm: false,
    editingId: "",
    deleting: false
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    const user = getCurrentUser()
    if (!user) {
      this.setData({ guestMode: true, loading: false, contentLoading: false, hasLoaded: true, items: [] })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    if (!this.data.hasLoaded) {
      void this.loadItems()
      return
    }
    if (this.data.keyMomentRevision !== getKeyMomentDataRevision()) {
      if (!this.syncItemsFromCache()) void this.loadItems({ background: true })
      return
    }
    const cached = getCachedKeyMoments({
      granularity: this.data.activeGranularity,
      date: this.data.anchorDate
    })
    if (!cached?.fresh) void this.loadItems({ background: true, silent: true })
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  handleScrollToTop() {
    this.setData({ timelineScrollAnchor: "" }, () => {
      if (isAsyncPageActive(this)) {
        this.setData({ timelineScrollAnchor: "timeline-scroll-top" })
      }
    })
  },

  syncItemsFromCache(input?: {
    granularity: KeyMomentGranularity
    date: string
  }): boolean {
    const query = input || {
      granularity: this.data.activeGranularity,
      date: this.data.anchorDate
    }
    const cached = getCachedKeyMoments(query)
    if (!cached) return false
    this.setData({
      items: toTimelineItems(cached.items),
      keyMomentRevision: getKeyMomentDataRevision()
    })
    return true
  },

  async loadItems(options: {
    background?: boolean
    forceRefresh?: boolean
    silent?: boolean
  } = {}) {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    const input = {
      granularity: this.data.activeGranularity,
      date: this.data.anchorDate
    }
    const cached = options.forceRefresh ? null : getCachedKeyMoments(input)
    const canRenderImmediately = Boolean(cached?.fresh)
    this.setData({
      loading: showInitialLoading && !canRenderImmediately,
      contentLoading: !showInitialLoading && !options.background && !canRenderImmediately
    })
    try {
      const session = await ensureLogin()
      const items = cached?.fresh
        ? cached.items
        : await listKeyMoments(input, { forceRefresh: options.forceRefresh })
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        items: toTimelineItems(items),
        canWrite: session.user.can_write,
        keyMomentRevision: getKeyMomentDataRevision()
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!options.silent) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载失败",
          icon: "none"
        })
      }
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
    if (!requireLoginForAction(this)) return
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading) return
    const now = currentShanghaiDateTime()
    const editorDate = this.data.activeGranularity === "day"
      ? this.data.anchorDate
      : now.date
    this.openEditor(`/pages/key-moments/edit/index?date=${editorDate}&time=${now.time}`)
  },

  handleMomentTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.loading || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    const dateTime = editorDateTime(item.occurred_at)
    wx.navigateTo({
      url: `/pages/key-moments/detail/index?id=${encodeURIComponent(item.id)}&date=${dateTime.date}`
    })
  },

  openEditor(url: string) {
    wx.navigateTo({
      url,
      events: {
        saved: (result: { date?: string }) => {
          const date = String(result?.date || "")
          if (!date) return
          this.setData({
            anchorDate: date,
            periodLabel: periodLabel(this.data.activeGranularity, date)
          })
        }
      }
    })
  },

  handlePreview(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    const url = String(event.currentTarget.dataset.url || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (url && item?.image_urls.length) {
      wx.previewImage({ current: url, urls: item.image_urls })
    }
  },

  handleDelete(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite
      || this.data.loading
      || this.data.contentLoading
      || this.data.deleting
    ) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ editingId: id, showDeleteConfirm: true })
  },

  handleDeleteConfirmCancel() {
    if (this.data.deleting) return
    this.setData({ showDeleteConfirm: false, editingId: "" })
  },

  async handleDeleteConfirm() {
    if (!this.data.editingId || this.data.deleting) return
    let toastTitle = ""
    let toastIcon: "success" | "none" = "success"
    this.setData({ deleting: true })
    wx.showLoading({ title: "删除中", mask: true })
    try {
      await deleteKeyMoment(this.data.editingId)
      if (!isAsyncPageActive(this)) return
      this.setData({ showDeleteConfirm: false, editingId: "" })
      if (!this.syncItemsFromCache()) await this.loadItems({ background: true })
      toastTitle = "已删除"
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ showDeleteConfirm: false, editingId: "" })
      }
      toastTitle = error instanceof Error ? error.message : "删除失败"
      toastIcon = "none"
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
    if (toastTitle && isAsyncPageActive(this)) {
      wx.showToast({ title: toastTitle, icon: toastIcon })
    }
  }
})

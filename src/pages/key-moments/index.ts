import { listKeyMoments } from "./services/key-moments"
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
  cacheKeyMoments,
  getCachedKeyMoments,
  getKeyMomentDataRevision
} from "../../utils/key-moment-data-cache"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const CHINESE_MONTHS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月"
]

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

function toTimelineItems(items: KeyMoment[]): KeyMomentTimelineItem[] {
  return items.map((item, index) => {
    const parts = shanghaiParts(item.occurred_at)
    const previousParts = index > 0 ? shanghaiParts(items[index - 1].occurred_at) : null
    const showDateHeading = !previousParts
      || previousParts.year !== parts.year
      || previousParts.month !== parts.month
      || previousParts.day !== parts.day
    return {
      ...item,
      show_date_heading: showDateHeading,
      show_year_heading: !previousParts || previousParts.year !== parts.year,
      show_item_divider: index < items.length - 1,
      heading_day: pad(parts.day),
      heading_month: CHINESE_MONTHS[parts.month - 1],
      heading_time: `${pad(parts.hour)}:${pad(parts.minute)}`,
      heading_year: `${parts.year}年`
    }
  })
}

function periodLabel(granularity: KeyMomentGranularity, date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  if (granularity === "year") return `${year}年`
  if (granularity === "month") return `${year}年${month}月`
  return `${year}年${month}月${day}日`
}

function canPublishInPeriod(granularity: KeyMomentGranularity, date: string): boolean {
  if (granularity === "day") return true
  const today = currentShanghaiDateTime().date
  return granularity === "year"
    ? date.slice(0, 4) === today.slice(0, 4)
    : date.slice(0, 7) === today.slice(0, 7)
}

const INITIAL_DATE_TIME = currentShanghaiDateTime()

Page({
  data: {
    granularityOptions: [
      { value: "year", label: "年" },
      { value: "month", label: "月" },
      { value: "day", label: "日" }
    ],
    activeGranularity: "year" as KeyMomentGranularity,
    anchorDate: INITIAL_DATE_TIME.date,
    periodLabel: periodLabel("year", INITIAL_DATE_TIME.date),
    items: [] as KeyMomentTimelineItem[],
    canWrite: false,
    guestMode: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    keyMomentRevision: -1,
    timelineScrollAnchor: "",
    nextCursor: "",
    loadingMore: false,
    loadError: "",
    canPublishInPeriod: true
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    const user = getCurrentUser()
    if (!user) {
      this.setData({
        guestMode: true,
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        items: [],
        nextCursor: "",
        loadError: ""
      })
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
      nextCursor: cached.nextCursor,
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
      contentLoading: !showInitialLoading && !options.background && !canRenderImmediately,
      loadingMore: false,
      ...(!canRenderImmediately ? { loadError: "" } : {})
    })
    try {
      const session = await ensureLogin()
      const page = cached?.fresh
        ? { items: cached.items, next_cursor: cached.nextCursor }
        : await listKeyMoments(input, { forceRefresh: options.forceRefresh })
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        items: toTimelineItems(page.items),
        nextCursor: page.next_cursor,
        canWrite: session.user.can_write,
        keyMomentRevision: getKeyMomentDataRevision(),
        loadError: ""
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!this.data.items.length) {
        this.setData({ loadError: error instanceof Error ? error.message : "加载失败，请重试。" })
      } else if (!options.silent) {
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

  async handleLoadMore() {
    if (
      !this.data.nextCursor
      || this.data.loadingMore
      || this.data.loading
      || this.data.contentLoading
      || !getCurrentUser()
    ) return
    const generation = beginAsyncPageRequest(this)
    const input = {
      granularity: this.data.activeGranularity,
      date: this.data.anchorDate
    }
    this.setData({ loadingMore: true })
    try {
      const page = await listKeyMoments(input, { cursor: this.data.nextCursor })
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const knownIds = new Set(this.data.items.map((item) => item.id))
      const items = [
        ...this.data.items,
        ...toTimelineItems(page.items.filter((item) => !knownIds.has(item.id)))
      ]
      const timelineItems = toTimelineItems(items)
      cacheKeyMoments(input, timelineItems, page.next_cursor)
      this.setData({
        items: timelineItems,
        nextCursor: page.next_cursor,
        keyMomentRevision: getKeyMomentDataRevision()
      })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载更多失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loadingMore: false })
    }
  },

  handleRetry() {
    if (this.data.loading || this.data.contentLoading) return
    void this.loadItems({ forceRefresh: true })
  },

  handleGranularityTap(event: WechatMiniprogram.TouchEvent) {
    const granularity = event.currentTarget.dataset.value as KeyMomentGranularity
    if (
      !granularity
      || granularity === this.data.activeGranularity
      || this.data.contentLoading
      || this.data.loadingMore
    ) return
    this.setData({
      activeGranularity: granularity,
      periodLabel: periodLabel(granularity, this.data.anchorDate),
      canPublishInPeriod: canPublishInPeriod(granularity, this.data.anchorDate),
      nextCursor: "",
      loadError: ""
    }, () => this.loadItems())
  },

  handleAnchorDateChange(event: WechatMiniprogram.PickerChange) {
    const date = String(event.detail.value)
    if (!date || date === this.data.anchorDate || this.data.loadingMore) return
    this.setData({
      anchorDate: date,
      periodLabel: periodLabel(this.data.activeGranularity, date),
      canPublishInPeriod: canPublishInPeriod(this.data.activeGranularity, date),
      nextCursor: "",
      loadError: ""
    }, () => this.loadItems())
  },

  handleAdd() {
    if (!requireLoginForAction(this)) return
    if (
      !this.data.canWrite
      || !this.data.canPublishInPeriod
      || this.data.loading
      || this.data.contentLoading
    ) return
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
    wx.navigateTo({
      url: `/pages/key-moments/detail/index?id=${encodeURIComponent(item.id)}`
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
            periodLabel: periodLabel(this.data.activeGranularity, date),
            canPublishInPeriod: canPublishInPeriod(this.data.activeGranularity, date)
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
  }
})

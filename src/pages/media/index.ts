import { ensureLogin, getCurrentUser } from "../../services/auth"
import { listMediaCategories, listMediaEntries } from "../../services/media"
import type { MediaEntry, MediaStatus, MediaType } from "../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { requireLoginForAction } from "../../utils/login-required"
import {
  MEDIA_CACHE_FRESH_MS,
  getCachedMediaCategories,
  getCachedMediaEntries,
  getCachedMediaEntryPage,
  getDeletedMediaEntryIds,
  isMediaCategoriesCacheFresh,
  type MediaEntryQuery
} from "../../utils/media-data-cache"
import { getMediaDataRevision } from "../../utils/media-data-revision"

type DisplayMode = "overview" | "record"
type OverviewStatus = Extract<MediaStatus, "in_progress" | "planned">
type RatingFilter = 0 | 1 | 2 | 3 | 4 | 5
type RatingFilterOption = {
  value: Exclude<RatingFilter, 0>
  label: string
}
type LoadCurrentViewOptions = {
  refreshShared?: boolean
  reset?: boolean
  forceRefresh?: boolean
  background?: boolean
}

type DisplayMediaEntry = MediaEntry & {
  placeholderIcon: string
  coverImageUrl: string
  ratingStars: Array<{ position: number; filled: boolean }>
}

type CachedSequence = {
  items: MediaEntry[]
  page: number
  total: number
  hasMore: boolean
  fresh: boolean
}

const PAGE_SIZE = 60
const SEARCH_DEBOUNCE_MS = 180
const RATING_FILTER_OPTIONS: RatingFilterOption[] = [
  { value: 5, label: "五星" },
  { value: 4, label: "四星" },
  { value: 3, label: "三星" },
  { value: 2, label: "二星" },
  { value: 1, label: "一星" }
]
let mediaSearchTimer: ReturnType<typeof setTimeout> | null = null
const contentScrollPositions = new WeakMap<object, number>()

function timestamp(value: string): number {
  const result = Date.parse(value)
  return Number.isNaN(result) ? 0 : result
}

function mediaPlaceholderIcon(mediaType: MediaType): string {
  const normalizedType = mediaType.trim().toLocaleLowerCase()
  if (/小说|书|读物|文学|books?/.test(normalizedType)) return "book-open"
  if (/动漫|动画|卡通|漫画/.test(normalizedType)) return "sparkles"
  if (/广播|有声|播客|音频|电台/.test(normalizedType)) return "headphones"
  if (/电视剧|剧集|综艺|电视/.test(normalizedType)) return "tv"
  return "clapperboard"
}

function toDisplayEntry(entry: MediaEntry): DisplayMediaEntry {
  const personalRating = entry.watch_status === "completed" && Number.isInteger(entry.personal_rating)
    ? Math.min(5, Math.max(1, Number(entry.personal_rating)))
    : null
  return {
    ...entry,
    personal_rating: personalRating,
    placeholderIcon: mediaPlaceholderIcon(entry.media_type),
    coverImageUrl: entry.cover_url || "",
    ratingStars: [1, 2, 3, 4, 5].map((position) => ({
      position,
      filled: personalRating !== null && position <= personalRating
    }))
  }
}

function sortByRecent(entries: MediaEntry[]): DisplayMediaEntry[] {
  return [...entries]
    .sort((left, right) =>
      timestamp(right.updated_at || right.created_at) -
      timestamp(left.updated_at || left.created_at)
    )
    .map(toDisplayEntry)
}

function sortByRating(entries: MediaEntry[]): DisplayMediaEntry[] {
  return [...entries]
    .sort((left, right) => {
      const rightRating = right.watch_status === "completed" ? Number(right.personal_rating || 0) : 0
      const leftRating = left.watch_status === "completed" ? Number(left.personal_rating || 0) : 0
      const ratingDifference = rightRating - leftRating
      if (ratingDifference) return ratingDifference
      return timestamp(right.updated_at || right.created_at) - timestamp(left.updated_at || left.created_at)
    })
    .map(toDisplayEntry)
}

function mergeEntries(
  current: DisplayMediaEntry[],
  additions: MediaEntry[],
  ratingFirst = false
): DisplayMediaEntry[] {
  const merged = new Map<string, MediaEntry>(current.map((entry) => [entry.id, entry]))
  additions.forEach((entry) => merged.set(entry.id, entry))
  return ratingFirst
    ? sortByRating([...merged.values()])
    : sortByRecent([...merged.values()])
}

function overviewQuery(
  status: OverviewStatus,
  category: MediaType,
  page: number
): MediaEntryQuery {
  return {
    mediaType: category || undefined,
    status,
    sort: "created_desc",
    page,
    pageSize: PAGE_SIZE
  }
}

function recordQuery(
  category: MediaType,
  keyword: string,
  personalRating: RatingFilter,
  page: number
): MediaEntryQuery {
  return {
    mediaType: category || undefined,
    keyword: keyword.trim() || undefined,
    personalRating: personalRating || undefined,
    sort: "rating_desc",
    page,
    pageSize: PAGE_SIZE
  }
}

function cachedSequence(inputForPage: (page: number) => MediaEntryQuery): CachedSequence | null {
  const items: MediaEntry[] = []
  let page = 1
  let total = 0
  let hasMore = true
  let fresh = true
  while (hasMore) {
    const cached = getCachedMediaEntryPage(inputForPage(page))
    if (!cached) break
    items.push(...cached.data.items)
    total = cached.data.pagination.total
    hasMore = cached.data.pagination.has_more
    fresh = fresh && cached.fresh
    page += 1
  }
  if (page === 1) return null
  return {
    items,
    page: page - 1,
    total,
    hasMore,
    fresh
  }
}

Page({
  data: {
    displayMode: "overview" as DisplayMode,
    mediaTypes: [] as MediaType[],
    selectedCategory: "" as MediaType,
    overviewStatus: "in_progress" as OverviewStatus,
    overviewInProgressSource: [] as DisplayMediaEntry[],
    overviewPlannedSource: [] as DisplayMediaEntry[],
    overviewItems: [] as DisplayMediaEntry[],
    overviewInProgressPage: 0,
    overviewPlannedPage: 0,
    overviewInProgressHasMore: true,
    overviewPlannedHasMore: true,
    overviewInProgressTotal: 0,
    overviewPlannedTotal: 0,
    overviewTotal: 0,
    recordSourceItems: [] as DisplayMediaEntry[],
    recordItems: [] as DisplayMediaEntry[],
    recordPage: 0,
    recordHasMore: true,
    recordTotal: 0,
    keyword: "",
    appliedKeyword: "",
    selectedRating: 0 as RatingFilter,
    ratingOptions: RATING_FILTER_OPTIONS,
    canWrite: false,
    guestMode: false,
    loading: true,
    contentLoading: false,
    loadingMore: false,
    refresherTriggered: false,
    hasLoaded: false,
    sharedLoaded: false,
    overviewLoaded: false,
    recordLoaded: false,
    mediaRevision: -1,
    localSyncExpiresAt: 0,
    contentScrollTop: 0,
    errorMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
    contentScrollPositions.set(this, 0)
  },

  onShow() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.setData({
        guestMode: true,
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        sharedLoaded: false,
        overviewLoaded: true,
        recordLoaded: true,
        overviewItems: [],
        recordItems: []
      })
      return
    }
    if (this.data.guestMode) {
      this.setData({ guestMode: false, hasLoaded: false, overviewLoaded: false, recordLoaded: false })
    }
    const mediaRevision = getMediaDataRevision()
    if (!this.data.hasLoaded) {
      const hydrated = this.hydrateCurrentViewFromCache()
      if (!hydrated) {
        void this.loadCurrentView({ refreshShared: true, reset: true })
      } else if (!hydrated.fresh) {
        void this.loadCurrentView({
          refreshShared: true,
          reset: true,
          forceRefresh: true,
          background: true
        })
      }
      return
    }
    if (this.data.mediaRevision !== mediaRevision) {
      if (!this.syncLoadedDataFromCache(mediaRevision)) {
        void this.loadCurrentView({ refreshShared: true, reset: true })
      }
      return
    }
    if (
      !this.isCurrentCacheFresh()
      && Date.now() >= this.data.localSyncExpiresAt
    ) {
      void this.loadCurrentView({
        refreshShared: true,
        reset: true,
        forceRefresh: true,
        background: true
      })
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
    contentScrollPositions.delete(this)
    if (mediaSearchTimer) clearTimeout(mediaSearchTimer)
    mediaSearchTimer = null
  },

  hydrateCurrentViewFromCache(): { fresh: boolean } | null {
    const categories = getCachedMediaCategories()
    const currentUser = getCurrentUser()
    if (!categories || !currentUser) return null
    const mediaTypes = categories.map((category) => category.name)
    const selectedCategory = mediaTypes.includes(this.data.selectedCategory)
      ? this.data.selectedCategory
      : ""
    const sequence = this.data.displayMode === "overview"
      ? cachedSequence((page) => overviewQuery(this.data.overviewStatus, selectedCategory, page))
      : cachedSequence((page) => recordQuery(
          selectedCategory,
          this.data.appliedKeyword,
          this.data.selectedRating,
          page
        ))
    if (!sequence) return null
    const displayItems = this.data.displayMode === "record"
      ? sortByRating(sequence.items)
      : sortByRecent(sequence.items)
    const update: Record<string, unknown> = {
      mediaTypes,
      selectedCategory,
      canWrite: currentUser.can_write,
      sharedLoaded: true,
      loading: false,
      contentLoading: false,
      hasLoaded: true,
      mediaRevision: getMediaDataRevision(),
      errorMessage: ""
    }
    if (this.data.displayMode === "overview") {
      const prefix = this.data.overviewStatus === "in_progress"
        ? "overviewInProgress"
        : "overviewPlanned"
      update[`${prefix}Source`] = displayItems
      update[`${prefix}Page`] = sequence.page
      update[`${prefix}HasMore`] = sequence.hasMore
      update[`${prefix}Total`] = sequence.total
      update.overviewItems = displayItems
      update.overviewTotal = sequence.total
      update.overviewLoaded = true
    } else {
      update.recordSourceItems = displayItems
      update.recordItems = displayItems
      update.recordPage = sequence.page
      update.recordHasMore = sequence.hasMore
      update.recordTotal = sequence.total
      update.recordLoaded = true
    }
    this.setData(update)
    return { fresh: sequence.fresh && isMediaCategoriesCacheFresh() }
  },

  isCurrentCacheFresh(): boolean {
    if (!isMediaCategoriesCacheFresh()) return false
    const input = this.data.displayMode === "overview"
      ? overviewQuery(this.data.overviewStatus, this.data.selectedCategory, 1)
      : recordQuery(
          this.data.selectedCategory,
          this.data.appliedKeyword,
          this.data.selectedRating,
          1
        )
    return getCachedMediaEntryPage(input)?.fresh === true
  },

  syncLoadedDataFromCache(mediaRevision: number): boolean {
    const categories = getCachedMediaCategories()
    if (!categories) return false
    const mediaTypes = categories.map((category) => category.name)
    const selectedCategory = mediaTypes.includes(this.data.selectedCategory)
      ? this.data.selectedCategory
      : ""
    const deletedIds = new Set(getDeletedMediaEntryIds())
    const cachedEntries = getCachedMediaEntries()
    const mergeLocal = (
      entries: DisplayMediaEntry[],
      status?: MediaStatus,
      ratingFirst = false
    ) =>
      mergeEntries(entries, cachedEntries, ratingFirst)
        .filter((entry) => !deletedIds.has(entry.id))
        .filter((entry) => !selectedCategory || entry.media_type === selectedCategory)
        .filter((entry) => !status || entry.watch_status === status)
    const overviewInProgressSource = this.data.overviewInProgressPage > 0
      ? mergeLocal(this.data.overviewInProgressSource, "in_progress")
      : this.data.overviewInProgressSource
    const overviewPlannedSource = this.data.overviewPlannedPage > 0
      ? mergeLocal(this.data.overviewPlannedSource, "planned")
      : this.data.overviewPlannedSource
    const keyword = this.data.appliedKeyword.trim().toLocaleLowerCase()
    const selectedRating = this.data.selectedRating
    const recordSourceItems = this.data.recordLoaded
      ? mergeLocal(this.data.recordSourceItems, undefined, true)
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
        .filter((entry) => !selectedRating || (
          entry.watch_status === "completed"
          && entry.personal_rating === selectedRating
        ))
      : this.data.recordSourceItems
    const overviewItems = this.data.overviewStatus === "in_progress"
      ? overviewInProgressSource
      : overviewPlannedSource
    const inProgressTotal = getCachedMediaEntryPage(
      overviewQuery("in_progress", selectedCategory, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewInProgressTotal,
      overviewInProgressSource.length
    )
    const plannedTotal = getCachedMediaEntryPage(
      overviewQuery("planned", selectedCategory, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewPlannedTotal,
      overviewPlannedSource.length
    )
    const recordTotal = getCachedMediaEntryPage(
      recordQuery(selectedCategory, this.data.appliedKeyword, selectedRating, 1)
    )?.data.pagination.total ?? Math.max(this.data.recordTotal, recordSourceItems.length)

    this.setData({
      mediaTypes,
      selectedCategory,
      sharedLoaded: true,
      overviewInProgressSource,
      overviewPlannedSource,
      overviewItems,
      overviewInProgressTotal: inProgressTotal,
      overviewPlannedTotal: plannedTotal,
      overviewTotal: this.data.overviewStatus === "in_progress" ? inProgressTotal : plannedTotal,
      recordSourceItems,
      recordItems: recordSourceItems,
      recordTotal,
      mediaRevision,
      localSyncExpiresAt: Date.now() + MEDIA_CACHE_FRESH_MS
    }, () => this.restoreContentScroll())
    return true
  },

  handleContentScroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
    const scrollTop = Number(event.detail.scrollTop)
    if (Number.isFinite(scrollTop)) contentScrollPositions.set(this, scrollTop)
  },

  restoreContentScroll() {
    const contentScrollTop = contentScrollPositions.get(this) || 0
    if (Math.abs(this.data.contentScrollTop - contentScrollTop) < 1) return
    this.setData({ contentScrollTop })
  },

  resetContentScroll(callback: () => void) {
    contentScrollPositions.set(this, 0)
    const intermediateScrollTop = this.data.contentScrollTop === 0 ? 1 : 0
    this.setData({ contentScrollTop: intermediateScrollTop }, () => {
      this.setData({ contentScrollTop: 0 }, callback)
    })
  },

  async loadCurrentView(options: LoadCurrentViewOptions = {}) {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    const reset = options.reset !== false
    const background = options.background === true
    const showInitialLoading = !this.data.hasLoaded && !background
    if (!background) {
      this.setData({
        loading: showInitialLoading,
        contentLoading: reset && !showInitialLoading,
        loadingMore: !reset,
        errorMessage: ""
      })
    }

    try {
      let mediaTypes = this.data.mediaTypes
      let selectedCategory = this.data.selectedCategory
      let canWrite = this.data.canWrite
      let sharedLoaded = this.data.sharedLoaded
      if (options.refreshShared || !sharedLoaded) {
        const [session, categories] = await Promise.all([
          ensureLogin(),
          listMediaCategories({ forceRefresh: options.forceRefresh })
        ])
        if (!isAsyncPageRequestCurrent(this, generation)) return
        mediaTypes = categories.map((category) => category.name)
        selectedCategory = mediaTypes.includes(selectedCategory) ? selectedCategory : ""
        canWrite = session.user.can_write
        sharedLoaded = true
      }

      if (this.data.displayMode === "overview") {
        const status = this.data.overviewStatus
        const prefix = status === "in_progress" ? "overviewInProgress" : "overviewPlanned"
        const currentPage = status === "in_progress"
          ? this.data.overviewInProgressPage
          : this.data.overviewPlannedPage
        const currentItems = status === "in_progress"
          ? this.data.overviewInProgressSource
          : this.data.overviewPlannedSource
        const page = reset ? 1 : currentPage + 1
        const result = await listMediaEntries(
          overviewQuery(status, selectedCategory, page),
          { forceRefresh: options.forceRefresh }
        )
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const items = reset
          ? sortByRecent(result.items)
          : mergeEntries(currentItems, result.items)
        this.setData({
          mediaTypes,
          selectedCategory,
          canWrite,
          sharedLoaded,
          [`${prefix}Source`]: items,
          [`${prefix}Page`]: page,
          [`${prefix}HasMore`]: result.pagination.has_more,
          [`${prefix}Total`]: result.pagination.total,
          overviewItems: items,
          overviewTotal: result.pagination.total,
          overviewLoaded: true,
          mediaRevision: getMediaDataRevision(),
          localSyncExpiresAt: 0
        })
      } else {
        const page = reset ? 1 : this.data.recordPage + 1
        const result = await listMediaEntries(
          recordQuery(
            selectedCategory,
            this.data.appliedKeyword,
            this.data.selectedRating,
            page
          ),
          { forceRefresh: options.forceRefresh }
        )
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const recordItems = reset
          ? sortByRating(result.items)
          : mergeEntries(this.data.recordSourceItems, result.items, true)
        this.setData({
          mediaTypes,
          selectedCategory,
          canWrite,
          sharedLoaded,
          recordSourceItems: recordItems,
          recordItems,
          recordPage: page,
          recordHasMore: result.pagination.has_more,
          recordTotal: result.pagination.total,
          recordLoaded: true,
          mediaRevision: getMediaDataRevision(),
          localSyncExpiresAt: 0
        })
      }
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation) || background) return
      this.setData({
        errorMessage: error instanceof Error ? error.message : "影视记录加载失败"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({
          loading: false,
          contentLoading: false,
          loadingMore: false,
          refresherTriggered: false,
          hasLoaded: true
        })
      }
    }
  },

  handleDisplayModeTap(event: WechatMiniprogram.TouchEvent) {
    const displayMode = event.currentTarget.dataset.mode as DisplayMode
    if (!displayMode || displayMode === this.data.displayMode) return
    const viewLoaded = displayMode === "overview"
      ? (this.data.overviewStatus === "in_progress"
          ? this.data.overviewInProgressPage > 0
          : this.data.overviewPlannedPage > 0)
      : this.data.recordLoaded
    this.setData({
      displayMode,
      overviewLoaded: displayMode === "overview" && viewLoaded,
      errorMessage: ""
    }, () => {
      if (displayMode === "overview" && viewLoaded) {
        this.showSelectedOverviewStatus()
      } else if (!viewLoaded) {
        void this.loadCurrentView({ reset: true })
      }
    })
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const selectedCategory = String(event.currentTarget.dataset.type || "")
    if (selectedCategory === this.data.selectedCategory) return
    this.setData({
      selectedCategory,
      overviewInProgressSource: [],
      overviewPlannedSource: [],
      overviewItems: [],
      overviewInProgressPage: 0,
      overviewPlannedPage: 0,
      overviewInProgressHasMore: true,
      overviewPlannedHasMore: true,
      overviewInProgressTotal: 0,
      overviewPlannedTotal: 0,
      overviewTotal: 0,
      overviewLoaded: false,
      recordSourceItems: [],
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false
    }, () => void this.loadCurrentView({ reset: true }))
  },

  handleOverviewStatusTap(event: WechatMiniprogram.TouchEvent) {
    const overviewStatus = String(event.currentTarget.dataset.status || "") as OverviewStatus
    if (!(["in_progress", "planned"] as string[]).includes(overviewStatus) || overviewStatus === this.data.overviewStatus) return
    const loaded = overviewStatus === "in_progress"
      ? this.data.overviewInProgressPage > 0
      : this.data.overviewPlannedPage > 0
    this.setData({ overviewStatus, overviewLoaded: loaded }, () => {
      if (loaded) this.showSelectedOverviewStatus()
      else void this.loadCurrentView({ reset: true })
    })
  },

  handleRatingTap(event: WechatMiniprogram.TouchEvent) {
    const selectedRating = Number(event.currentTarget.dataset.rating) as RatingFilter
    if (!Number.isInteger(selectedRating) || selectedRating < 0 || selectedRating > 5) return
    if (selectedRating === this.data.selectedRating) return
    this.setData({
      selectedRating,
      recordSourceItems: [],
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false
    }, () => this.resetContentScroll(() => void this.loadCurrentView({ reset: true })))
  },

  showSelectedOverviewStatus() {
    const inProgress = this.data.overviewStatus === "in_progress"
    this.setData({
      overviewItems: inProgress
        ? this.data.overviewInProgressSource
        : this.data.overviewPlannedSource,
      overviewTotal: inProgress
        ? this.data.overviewInProgressTotal
        : this.data.overviewPlannedTotal
    })
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    const keyword = event.detail.value
    this.setData({ keyword })
    if (this.data.displayMode !== "record") return
    if (mediaSearchTimer) clearTimeout(mediaSearchTimer)
    mediaSearchTimer = setTimeout(() => {
      mediaSearchTimer = null
      if (this.data.displayMode !== "record") return
      this.applySearch(keyword)
    }, SEARCH_DEBOUNCE_MS)
  },

  handleSearch() {
    if (mediaSearchTimer) clearTimeout(mediaSearchTimer)
    mediaSearchTimer = null
    this.applySearch(this.data.keyword)
  },

  applySearch(keyword: string) {
    const appliedKeyword = keyword.trim()
    if (appliedKeyword === this.data.appliedKeyword && this.data.recordLoaded) return
    this.setData({
      appliedKeyword,
      recordSourceItems: [],
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false
    }, () => void this.loadCurrentView({ reset: true }))
  },

  handleClearSearch() {
    if (mediaSearchTimer) clearTimeout(mediaSearchTimer)
    mediaSearchTimer = null
    this.setData({ keyword: "" }, () => this.applySearch(""))
  },

  handleContentLower() {
    if (this.data.loading || this.data.contentLoading || this.data.loadingMore) return
    const hasMore = this.data.displayMode === "overview"
      ? (this.data.overviewStatus === "in_progress"
          ? this.data.overviewInProgressHasMore
          : this.data.overviewPlannedHasMore)
      : this.data.recordHasMore
    if (hasMore) void this.loadCurrentView({ reset: false })
  },

  handlePullRefresh() {
    if (!getCurrentUser()) {
      this.setData({ refresherTriggered: false })
      return
    }
    if (this.data.loading || this.data.contentLoading || this.data.loadingMore) return
    this.setData({ refresherTriggered: true })
    void this.loadCurrentView({
      refreshShared: true,
      reset: true,
      forceRefresh: true,
      background: true
    })
  },

  handleAdd() {
    if (!requireLoginForAction(this)) return
    if (!this.data.canWrite || this.data.contentLoading) return
    if (!this.data.mediaTypes.length) {
      wx.showToast({ title: "请先创建影视分类", icon: "none" })
      wx.navigateTo({ url: "/pages/media/categories/index" })
      return
    }
    const mediaType = this.data.selectedCategory || this.data.mediaTypes[0]
    wx.navigateTo({
      url: `/pages/media/edit/index?mediaType=${encodeURIComponent(mediaType)}`
    })
  },

  handleManageCategories() {
    if (!requireLoginForAction(this)) return
    if (!this.data.canWrite || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/media/categories/index" })
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    this.openMediaEntry(String(event.currentTarget.dataset.id || ""))
  },

  openMediaEntry(id: string) {
    if (id) wx.navigateTo({ url: `/pages/media/detail/index?id=${id}` })
  },

  handleRetry() {
    void this.loadCurrentView({
      refreshShared: !this.data.sharedLoaded,
      reset: true,
      forceRefresh: true
    })
  }
})

import { ensureLogin, getCurrentUser } from "../../services/auth"
import {
  listMediaCategories,
  listMediaEntries,
  listMediaSeasons,
  setMediaWatchProgress
} from "../../services/media"
import type { MediaEntry, MediaSeason, MediaStatus, MediaType } from "../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
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
import { getMediaDataRevision, markMediaDataChanged } from "../../utils/media-data-revision"

type DisplayMode = "overview" | "record"
type OverviewStatus = Extract<MediaStatus, "in_progress" | "planned"> | "all" | "special_favorite"
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
  showWatchProgress: boolean
  watchProgressText: string
}

type MediaListStore = {
  overview: Record<OverviewStatus, DisplayMediaEntry[]>
  record: DisplayMediaEntry[]
}

type CachedSequence = {
  items: MediaEntry[]
  page: number
  total: number
  hasMore: boolean
  fresh: boolean
}

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 400
const RATING_FILTER_OPTIONS: RatingFilterOption[] = [
  { value: 5, label: "五星" },
  { value: 4, label: "四星" },
  { value: 3, label: "三星" },
  { value: 2, label: "二星" },
  { value: 1, label: "一星" }
]
let mediaSearchTimer: ReturnType<typeof setTimeout> | null = null
const contentScrollPositions = new WeakMap<object, number>()
const mediaListStores = new WeakMap<object, MediaListStore>()

function emptyMediaListStore(): MediaListStore {
  return {
    overview: {
      all: [],
      in_progress: [],
      planned: [],
      special_favorite: []
    },
    record: []
  }
}

function mediaListStore(page: object): MediaListStore {
  const existing = mediaListStores.get(page)
  if (existing) return existing
  const created = emptyMediaListStore()
  mediaListStores.set(page, created)
  return created
}

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

function watchProgressText(entry: MediaEntry): string {
  if (!entry.last_watched_episode_id || !Number.isInteger(entry.last_watched_episode_number)) {
    return "记录看到哪一集"
  }
  const seasonNumber = Number.isInteger(entry.last_watched_season_number)
    ? Number(entry.last_watched_season_number)
    : Number.isInteger(Number(entry.last_watched_season_sort_order) / 1000)
      ? Number(entry.last_watched_season_sort_order) / 1000
      : null
  if (entry.season_count > 1 && seasonNumber) {
    return `看到第 ${seasonNumber} 季 · ${entry.last_watched_episode_number} 集`
  }
  return `看到 ${entry.last_watched_episode_number} 集`
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
    showWatchProgress: entry.watch_status === "in_progress" && (
      entry.season_count > 0
      || /电视剧|剧集|综艺|电视|动漫|动画|广播剧/.test(entry.media_type)
    ),
    watchProgressText: watchProgressText(entry)
  }
}

function sortByRecent(entries: MediaEntry[]): DisplayMediaEntry[] {
  return [...entries]
    .sort((left, right) => {
      const timeDifference = timestamp(right.updated_at || right.created_at)
        - timestamp(left.updated_at || left.created_at)
      return timeDifference || right.id.localeCompare(left.id)
    })
    .map(toDisplayEntry)
}

function sortByRating(entries: MediaEntry[]): DisplayMediaEntry[] {
  return [...entries]
    .sort((left, right) => {
      const rightRating = right.watch_status === "completed" ? Number(right.personal_rating || 0) : 0
      const leftRating = left.watch_status === "completed" ? Number(left.personal_rating || 0) : 0
      const ratingDifference = rightRating - leftRating
      if (ratingDifference) return ratingDifference
      const timeDifference = timestamp(right.updated_at || right.created_at)
        - timestamp(left.updated_at || left.created_at)
      return timeDifference || right.id.localeCompare(left.id)
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
  keyword: string,
  page: number,
  knownTotal?: number
): MediaEntryQuery {
  const queryStatus = status === "all" || status === "special_favorite"
    ? undefined
    : status
  return {
    mediaType: category || undefined,
    status: queryStatus,
    specialFavorite: status === "special_favorite" ? true : undefined,
    keyword: keyword.trim() || undefined,
    sort: "updated_desc",
    page,
    pageSize: PAGE_SIZE,
    knownTotal
  }
}

function recordQuery(
  category: MediaType,
  keyword: string,
  personalRating: RatingFilter,
  page: number,
  knownTotal?: number
): MediaEntryQuery {
  return {
    mediaType: category || undefined,
    keyword: keyword.trim() || undefined,
    personalRating: personalRating || undefined,
    sort: "rating_desc",
    page,
    pageSize: PAGE_SIZE,
    knownTotal
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
    overviewItems: [] as DisplayMediaEntry[],
    overviewInProgressPage: 0,
    overviewPlannedPage: 0,
    overviewAllPage: 0,
    overviewSpecialFavoritePage: 0,
    overviewInProgressHasMore: true,
    overviewPlannedHasMore: true,
    overviewAllHasMore: true,
    overviewSpecialFavoriteHasMore: true,
    overviewInProgressTotal: 0,
    overviewPlannedTotal: 0,
    overviewAllTotal: 0,
    overviewSpecialFavoriteTotal: 0,
    overviewTotal: 0,
    recordItems: [] as DisplayMediaEntry[],
    recordPage: 0,
    recordHasMore: true,
    recordTotal: 0,
    keyword: "",
    appliedKeyword: "",
    selectedRating: 0 as RatingFilter,
    ratingOptions: RATING_FILTER_OPTIONS,
    loadingPlaceholders: [1, 2, 3, 4, 5, 6, 7, 8, 9],
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
    errorMessage: "",
    moreMenuVisible: false,
    progressPickerVisible: false,
    progressPickerSeasons: [] as MediaSeason[],
    progressPickerEntryId: "",
    progressPickerEpisodeId: "",
    progressPickerLoading: false,
    progressSaving: false
  },

  onLoad() {
    activateAsyncPage(this)
    contentScrollPositions.set(this, 0)
    mediaListStores.set(this, emptyMediaListStore())
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
    mediaListStores.delete(this)
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
      ? cachedSequence((page) => overviewQuery(
          this.data.overviewStatus,
          selectedCategory,
          this.data.appliedKeyword,
          page
        ))
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
      mediaListStore(this).overview[this.data.overviewStatus] = displayItems
      const prefix = this.data.overviewStatus === "in_progress"
        ? "overviewInProgress"
        : this.data.overviewStatus === "planned"
          ? "overviewPlanned"
          : this.data.overviewStatus === "special_favorite"
            ? "overviewSpecialFavorite"
            : "overviewAll"
      update[`${prefix}Page`] = sequence.page
      update[`${prefix}HasMore`] = sequence.hasMore
      update[`${prefix}Total`] = sequence.total
      update.overviewItems = displayItems
      update.overviewTotal = sequence.total
      update.overviewLoaded = true
    } else {
      mediaListStore(this).record = displayItems
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
      ? overviewQuery(this.data.overviewStatus, this.data.selectedCategory, this.data.appliedKeyword, 1)
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
    const store = mediaListStore(this)
    const keyword = this.data.appliedKeyword.trim().toLocaleLowerCase()
    const mergeLocal = (
      entries: DisplayMediaEntry[],
      status?: MediaStatus,
      ratingFirst = false
    ) =>
      mergeEntries(entries, cachedEntries, ratingFirst)
        .filter((entry) => !deletedIds.has(entry.id))
        .filter((entry) => !selectedCategory || entry.media_type === selectedCategory)
        .filter((entry) => !status || entry.watch_status === status)
    const overviewInProgressItems = this.data.overviewInProgressPage > 0
      ? mergeLocal(store.overview.in_progress, "in_progress")
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
        : store.overview.in_progress
    const overviewPlannedItems = this.data.overviewPlannedPage > 0
      ? mergeLocal(store.overview.planned, "planned")
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
        : store.overview.planned
    const overviewAllItems = this.data.overviewAllPage > 0
      ? mergeLocal(store.overview.all)
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
      : store.overview.all
    const overviewSpecialFavoriteItems = this.data.overviewSpecialFavoritePage > 0
      ? mergeLocal(store.overview.special_favorite)
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
        .filter((entry) => entry.is_special_favorite)
      : store.overview.special_favorite
    const selectedRating = this.data.selectedRating
    const recordItems = this.data.recordLoaded
      ? mergeLocal(store.record, undefined, true)
        .filter((entry) => !keyword || entry.title.toLocaleLowerCase().includes(keyword))
        .filter((entry) => !selectedRating || (
          entry.watch_status === "completed"
          && entry.personal_rating === selectedRating
        ))
      : store.record
    store.overview.in_progress = overviewInProgressItems
    store.overview.planned = overviewPlannedItems
    store.overview.all = overviewAllItems
    store.overview.special_favorite = overviewSpecialFavoriteItems
    store.record = recordItems
    const overviewItems = this.data.overviewStatus === "in_progress"
      ? overviewInProgressItems
      : this.data.overviewStatus === "planned"
        ? overviewPlannedItems
        : this.data.overviewStatus === "special_favorite"
          ? overviewSpecialFavoriteItems
          : overviewAllItems
    const inProgressTotal = getCachedMediaEntryPage(
      overviewQuery("in_progress", selectedCategory, this.data.appliedKeyword, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewInProgressTotal,
      overviewInProgressItems.length
    )
    const plannedTotal = getCachedMediaEntryPage(
      overviewQuery("planned", selectedCategory, this.data.appliedKeyword, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewPlannedTotal,
      overviewPlannedItems.length
    )
    const allTotal = getCachedMediaEntryPage(
      overviewQuery("all", selectedCategory, this.data.appliedKeyword, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewAllTotal,
      overviewAllItems.length
    )
    const specialFavoriteTotal = getCachedMediaEntryPage(
      overviewQuery("special_favorite", selectedCategory, this.data.appliedKeyword, 1)
    )?.data.pagination.total ?? Math.max(
      this.data.overviewSpecialFavoriteTotal,
      overviewSpecialFavoriteItems.length
    )
    const recordTotal = getCachedMediaEntryPage(
      recordQuery(selectedCategory, this.data.appliedKeyword, selectedRating, 1)
    )?.data.pagination.total ?? Math.max(this.data.recordTotal, recordItems.length)

    this.setData({
      mediaTypes,
      selectedCategory,
      sharedLoaded: true,
      overviewItems,
      overviewInProgressTotal: inProgressTotal,
      overviewPlannedTotal: plannedTotal,
      overviewAllTotal: allTotal,
      overviewSpecialFavoriteTotal: specialFavoriteTotal,
      overviewTotal: this.data.overviewStatus === "in_progress"
        ? inProgressTotal
        : this.data.overviewStatus === "planned"
          ? plannedTotal
          : this.data.overviewStatus === "special_favorite"
            ? specialFavoriteTotal
            : allTotal,
      recordItems,
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
        const prefix = status === "in_progress"
          ? "overviewInProgress"
          : status === "planned"
            ? "overviewPlanned"
            : status === "special_favorite"
              ? "overviewSpecialFavorite"
              : "overviewAll"
        const currentPage = status === "in_progress"
          ? this.data.overviewInProgressPage
          : status === "planned"
            ? this.data.overviewPlannedPage
            : status === "special_favorite"
              ? this.data.overviewSpecialFavoritePage
              : this.data.overviewAllPage
        const store = mediaListStore(this)
        const currentItems = store.overview[status]
        const currentTotal = status === "in_progress"
          ? this.data.overviewInProgressTotal
          : status === "planned"
            ? this.data.overviewPlannedTotal
            : status === "special_favorite"
              ? this.data.overviewSpecialFavoriteTotal
              : this.data.overviewAllTotal
        const page = reset ? 1 : currentPage + 1
        const result = await listMediaEntries(
          overviewQuery(
            status,
            selectedCategory,
            this.data.appliedKeyword,
            page,
            reset ? undefined : currentTotal
          ),
          { forceRefresh: options.forceRefresh }
        )
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const items = reset
          ? result.items.map(toDisplayEntry)
          : mergeEntries(currentItems, result.items)
        store.overview[status] = items
        this.setData({
          mediaTypes,
          selectedCategory,
          canWrite,
          sharedLoaded,
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
        const store = mediaListStore(this)
        const page = reset ? 1 : this.data.recordPage + 1
        const result = await listMediaEntries(
          recordQuery(
            selectedCategory,
            this.data.appliedKeyword,
            this.data.selectedRating,
            page,
            reset ? undefined : this.data.recordTotal
          ),
          { forceRefresh: options.forceRefresh }
        )
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const recordItems = reset
          ? result.items.map(toDisplayEntry)
          : mergeEntries(store.record, result.items, true)
        store.record = recordItems
        this.setData({
          mediaTypes,
          selectedCategory,
          canWrite,
          sharedLoaded,
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
      ? (this.data.overviewStatus === "all"
          ? this.data.overviewAllPage > 0
          : this.data.overviewStatus === "in_progress"
          ? this.data.overviewInProgressPage > 0
          : this.data.overviewStatus === "special_favorite"
          ? this.data.overviewSpecialFavoritePage > 0
          : this.data.overviewPlannedPage > 0)
      : this.data.recordLoaded
    this.setData({
      displayMode,
      overviewLoaded: displayMode === "overview" && viewLoaded,
      errorMessage: ""
    }, () => {
      this.resetContentScroll(() => {
        if (displayMode === "overview" && viewLoaded) {
          this.showSelectedOverviewStatus()
        } else if (displayMode === "record" && viewLoaded) {
          this.setData({ recordItems: mediaListStore(this).record })
        } else {
          void this.loadCurrentView({ reset: true })
        }
      })
    })
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const selectedCategory = String(event.currentTarget.dataset.type || "")
    if (selectedCategory === this.data.selectedCategory) return
    mediaListStores.set(this, emptyMediaListStore())
    this.setData({
      selectedCategory,
      overviewItems: [],
      overviewInProgressPage: 0,
      overviewPlannedPage: 0,
      overviewAllPage: 0,
      overviewSpecialFavoritePage: 0,
      overviewInProgressHasMore: true,
      overviewPlannedHasMore: true,
      overviewAllHasMore: true,
      overviewSpecialFavoriteHasMore: true,
      overviewInProgressTotal: 0,
      overviewPlannedTotal: 0,
      overviewAllTotal: 0,
      overviewSpecialFavoriteTotal: 0,
      overviewTotal: 0,
      overviewLoaded: false,
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false
    }, () => this.resetContentScroll(() => void this.loadCurrentView({ reset: true })))
  },

  handleOverviewStatusTap(event: WechatMiniprogram.TouchEvent) {
    const overviewStatus = String(event.currentTarget.dataset.status || "") as OverviewStatus
    if (!(["all", "in_progress", "planned", "special_favorite"] as string[]).includes(overviewStatus) || overviewStatus === this.data.overviewStatus) return
    const loaded = overviewStatus === "all"
      ? this.data.overviewAllPage > 0
      : overviewStatus === "in_progress"
        ? this.data.overviewInProgressPage > 0
        : overviewStatus === "special_favorite"
          ? this.data.overviewSpecialFavoritePage > 0
          : this.data.overviewPlannedPage > 0
    this.setData({ overviewStatus, overviewLoaded: loaded }, () => {
      this.resetContentScroll(() => {
        if (loaded) this.showSelectedOverviewStatus()
        else void this.loadCurrentView({ reset: true })
      })
    })
  },

  handleRatingTap(event: WechatMiniprogram.TouchEvent) {
    const selectedRating = Number(event.currentTarget.dataset.rating) as RatingFilter
    if (!Number.isInteger(selectedRating) || selectedRating < 0 || selectedRating > 5) return
    if (selectedRating === this.data.selectedRating) return
    mediaListStore(this).record = []
    this.setData({
      selectedRating,
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false
    }, () => this.resetContentScroll(() => void this.loadCurrentView({ reset: true })))
  },

  showSelectedOverviewStatus() {
    const inProgress = this.data.overviewStatus === "in_progress"
    const overview = mediaListStore(this).overview
    this.setData({
      overviewItems: inProgress
        ? overview.in_progress
        : this.data.overviewStatus === "planned"
          ? overview.planned
          : this.data.overviewStatus === "special_favorite"
            ? overview.special_favorite
            : overview.all,
      overviewTotal: inProgress
        ? this.data.overviewInProgressTotal
        : this.data.overviewStatus === "planned"
          ? this.data.overviewPlannedTotal
          : this.data.overviewStatus === "special_favorite"
            ? this.data.overviewSpecialFavoriteTotal
            : this.data.overviewAllTotal
    })
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    const keyword = event.detail.value
    this.setData({ keyword })
    if (mediaSearchTimer) clearTimeout(mediaSearchTimer)
    if (!keyword.trim()) {
      mediaSearchTimer = null
      this.applySearch("")
      return
    }
    mediaSearchTimer = setTimeout(() => {
        mediaSearchTimer = null
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
    mediaListStores.set(this, emptyMediaListStore())
    this.setData({
      appliedKeyword,
      recordItems: [],
      recordPage: 0,
      recordHasMore: true,
      recordTotal: 0,
      recordLoaded: false,
      overviewItems: [],
      overviewInProgressPage: 0,
      overviewPlannedPage: 0,
      overviewAllPage: 0,
      overviewSpecialFavoritePage: 0,
      overviewInProgressHasMore: true,
      overviewPlannedHasMore: true,
      overviewAllHasMore: true,
      overviewSpecialFavoriteHasMore: true,
      overviewInProgressTotal: 0,
      overviewPlannedTotal: 0,
      overviewAllTotal: 0,
      overviewSpecialFavoriteTotal: 0,
      overviewTotal: 0,
      overviewLoaded: false
    }, () => this.resetContentScroll(() => void this.loadCurrentView({ reset: true })))
  },

  handleContentLower() {
    if (this.data.loading || this.data.contentLoading || this.data.loadingMore) return
    const hasMore = this.data.displayMode === "overview"
      ? (this.data.overviewStatus === "all"
          ? this.data.overviewAllHasMore
          : this.data.overviewStatus === "in_progress"
          ? this.data.overviewInProgressHasMore
          : this.data.overviewStatus === "special_favorite"
          ? this.data.overviewSpecialFavoriteHasMore
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

  handleMoreOpen() {
    if ((!this.data.canWrite && !this.data.guestMode) || this.data.contentLoading) return
    this.setData({ moreMenuVisible: true })
  },

  handleMoreClose() {
    this.setData({ moreMenuVisible: false })
  },

  handleManageCategories() {
    if ((!this.data.canWrite && !this.data.guestMode) || this.data.contentLoading) return
    this.setData({ moreMenuVisible: false }, () => {
      wx.navigateTo({ url: "/pages/media/categories/index" })
    })
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    this.openMediaEntry(String(event.currentTarget.dataset.id || ""))
  },

  openMediaEntry(id: string) {
    if (id) wx.navigateTo({ url: `/pages/media/detail/index?id=${id}` })
  },

  async handleProgressTap(event: WechatMiniprogram.TouchEvent) {
    const entryId = String(event.currentTarget.dataset.id || "")
    if (!this.data.canWrite || !entryId || this.data.progressPickerLoading || this.data.progressSaving) return
    const entry = [...this.data.overviewItems, ...this.data.recordItems]
      .find((item) => item.id === entryId)
    if (!entry || entry.watch_status !== "in_progress") return
    this.setData({ progressPickerLoading: true })
    wx.showLoading({ title: "加载选集", mask: true })
    try {
      const seasons = await listMediaSeasons(entryId)
      if (!isAsyncPageActive(this)) return
      this.setData({
        progressPickerVisible: true,
        progressPickerSeasons: seasons,
        progressPickerEntryId: entryId,
        progressPickerEpisodeId: entry.last_watched_episode_id || ""
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "选集加载失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ progressPickerLoading: false })
    }
  },

  handleProgressPickerCancel() {
    if (this.data.progressSaving) return
    this.setData({ progressPickerVisible: false })
  },

  async handleProgressPickerSelect(
    event: WechatMiniprogram.CustomEvent<{ episodeId: string }>
  ) {
    const mediaEntryId = this.data.progressPickerEntryId
    const episodeId = String(event.detail.episodeId || "")
    if (!this.data.canWrite || !mediaEntryId || !episodeId || this.data.progressSaving) return
    this.setData({ progressPickerVisible: false, progressSaving: true })
    wx.showLoading({ title: "更新进度", mask: true })
    try {
      await setMediaWatchProgress(mediaEntryId, episodeId)
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.syncLoadedDataFromCache(mediaRevision)
      wx.showToast({ title: "观看进度已更新", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "进度更新失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ progressSaving: false })
    }
  },

  handleRetry() {
    void this.loadCurrentView({
      refreshShared: !this.data.sharedLoaded,
      reset: true,
      forceRefresh: true
    })
  }
})

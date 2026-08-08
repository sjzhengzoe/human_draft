import { ensureLogin } from "../../services/auth"
import { listMediaCategories, listMediaEntries } from "../../services/media"
import type { MediaEntry, MediaStatus, MediaType } from "../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { getMediaDataRevision } from "../../utils/media-data-revision"

type DisplayMode = "overview" | "record"
type OverviewStatus = Extract<MediaStatus, "in_progress" | "planned">
type LoadCurrentViewOptions = { refreshShared?: boolean }

type DisplayMediaEntry = MediaEntry & {
  metaText: string
  statsText: string
  favoriteText: string
  placeholderIcon: string
}

const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"]
const PAGE_SIZE = 100

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
  const isEpisodic = EPISODIC_MEDIA_TYPES.includes(entry.media_type)
  const platformText = entry.platforms.length ? entry.platforms.join(" / ") : "未记录平台"
  const seasonCount = entry.season_count || 0
  const episodeCount = entry.episode_count || 0
  return {
    ...entry,
    metaText: `${entry.media_type} · ${platformText}`,
    statsText: isEpisodic && (seasonCount > 0 || episodeCount > 0)
      ? `${seasonCount} 季 · ${episodeCount} 集`
      : "",
    favoriteText: entry.favorite_episode_count
      ? `喜欢 ${entry.favorite_episode_count} 集`
      : "",
    placeholderIcon: mediaPlaceholderIcon(entry.media_type)
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

function filterOverviewItems(
  status: OverviewStatus,
  category: MediaType,
  inProgressItems: DisplayMediaEntry[],
  plannedItems: DisplayMediaEntry[]
): DisplayMediaEntry[] {
  const sourceItems = status === "in_progress" ? inProgressItems : plannedItems
  return category
    ? sourceItems.filter((item) => item.media_type === category)
    : sourceItems
}

async function listAllEntries(status?: MediaStatus): Promise<MediaEntry[]> {
  const items: MediaEntry[] = []
  let page = 1
  let hasMore = true
  while (hasMore) {
    const result = await listMediaEntries({
      status,
      page,
      pageSize: PAGE_SIZE
    })
    items.push(...result.items)
    hasMore = result.pagination.has_more
    page += 1
  }
  return items
}

Page({
  data: {
    displayMode: "overview" as DisplayMode,
    mediaTypes: [] as MediaType[],
    overviewCategory: "" as MediaType,
    overviewStatus: "in_progress" as OverviewStatus,
    overviewInProgressSource: [] as DisplayMediaEntry[],
    overviewPlannedSource: [] as DisplayMediaEntry[],
    overviewItems: [] as DisplayMediaEntry[],
    activeRecordType: "" as MediaType,
    recordSourceItems: [] as DisplayMediaEntry[],
    recordItems: [] as DisplayMediaEntry[],
    keyword: "",
    appliedKeyword: "",
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    sharedLoaded: false,
    overviewLoaded: false,
    recordLoaded: false,
    mediaRevision: -1,
    errorMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    const mediaRevision = getMediaDataRevision()
    if (!this.data.hasLoaded) {
      void this.loadCurrentView({ refreshShared: true })
      return
    }
    if (this.data.mediaRevision !== mediaRevision) {
      this.setData({
        sharedLoaded: false,
        overviewLoaded: false,
        recordLoaded: false
      }, () => {
        void this.loadCurrentView({ refreshShared: true })
      })
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadCurrentView(options: LoadCurrentViewOptions = {}) {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    const displayMode = this.data.displayMode
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })

    try {
      let sharedData = {
        mediaTypes: this.data.mediaTypes,
        overviewCategory: this.data.overviewCategory,
        activeRecordType: this.data.activeRecordType,
        canWrite: this.data.canWrite,
        sharedLoaded: this.data.sharedLoaded
      }
      if (options.refreshShared || !this.data.sharedLoaded) {
        const [session, categories] = await Promise.all([
          ensureLogin(),
          listMediaCategories()
        ])
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const mediaTypes = categories.map((category) => category.name)
        const overviewCategory = mediaTypes.includes(this.data.overviewCategory)
          ? this.data.overviewCategory
          : ""
        const activeRecordType = mediaTypes.includes(this.data.activeRecordType)
          ? this.data.activeRecordType
          : ""
        sharedData = {
          mediaTypes,
          overviewCategory,
          activeRecordType,
          canWrite: session.user.can_write,
          sharedLoaded: true
        }
      }

      const { overviewCategory, activeRecordType } = sharedData

      if (displayMode === "overview") {
        const [inProgressEntries, plannedEntries] = await Promise.all([
          listAllEntries("in_progress"),
          listAllEntries("planned")
        ])
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const overviewInProgressSource = sortByRecent(inProgressEntries)
        const overviewPlannedSource = sortByRecent(plannedEntries)
        this.setData({
          ...sharedData,
          overviewInProgressSource,
          overviewPlannedSource,
          overviewItems: filterOverviewItems(
            this.data.overviewStatus,
            overviewCategory,
            overviewInProgressSource,
            overviewPlannedSource
          ),
          overviewLoaded: true,
          mediaRevision: getMediaDataRevision()
        })
      } else {
        const recordSourceItems = sortByRecent(await listAllEntries())
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const appliedKeyword = this.data.appliedKeyword.trim().toLocaleLowerCase()
        this.setData({
          ...sharedData,
          recordSourceItems,
          recordItems: recordSourceItems.filter((item) =>
            (!activeRecordType || item.media_type === activeRecordType) &&
            (!appliedKeyword || item.title.toLocaleLowerCase().includes(appliedKeyword))
          ),
          recordLoaded: true,
          mediaRevision: getMediaDataRevision()
        })
      }
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        errorMessage: error instanceof Error ? error.message : "影视记录加载失败"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({
          loading: false,
          contentLoading: false,
          hasLoaded: true
        })
      }
    }
  },

  handleDisplayModeTap(event: WechatMiniprogram.TouchEvent) {
    const displayMode = event.currentTarget.dataset.mode as DisplayMode
    if (!displayMode || displayMode === this.data.displayMode) return
    const viewLoaded = displayMode === "overview"
      ? this.data.overviewLoaded
      : this.data.recordLoaded
    this.setData({ displayMode, errorMessage: "" }, () => {
      if (!viewLoaded) void this.loadCurrentView()
    })
  },

  handleOverviewCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const overviewCategory = String(event.currentTarget.dataset.type || "")
    if (overviewCategory === this.data.overviewCategory) return
    this.setData({ overviewCategory }, () => this.applyOverviewFilters())
  },

  handleOverviewStatusTap(event: WechatMiniprogram.TouchEvent) {
    const overviewStatus = String(event.currentTarget.dataset.status || "") as OverviewStatus
    if (!["in_progress", "planned"].includes(overviewStatus) || overviewStatus === this.data.overviewStatus) return
    this.setData({ overviewStatus }, () => this.applyOverviewFilters())
  },

  applyOverviewFilters() {
    this.setData({
      overviewItems: filterOverviewItems(
        this.data.overviewStatus,
        this.data.overviewCategory,
        this.data.overviewInProgressSource,
        this.data.overviewPlannedSource
      )
    })
  },

  handleRecordTypeTap(event: WechatMiniprogram.TouchEvent) {
    const activeRecordType = String(event.currentTarget.dataset.type || "")
    if (activeRecordType === this.data.activeRecordType) return
    this.setData({ activeRecordType }, () => this.applyRecordFilters())
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value })
  },

  handleSearch() {
    this.setData({ appliedKeyword: this.data.keyword.trim() }, () => {
      this.applyRecordFilters()
    })
  },

  handleClearSearch() {
    this.setData({ keyword: "", appliedKeyword: "" }, () => {
      this.applyRecordFilters()
    })
  },

  applyRecordFilters() {
    const keyword = this.data.appliedKeyword.trim().toLocaleLowerCase()
    const activeRecordType = this.data.activeRecordType
    this.setData({
      recordItems: this.data.recordSourceItems.filter((item) =>
        (!activeRecordType || item.media_type === activeRecordType) &&
        (!keyword || item.title.toLocaleLowerCase().includes(keyword))
      )
    })
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.contentLoading) return
    if (!this.data.mediaTypes.length) {
      wx.showToast({ title: "请先创建影视分类", icon: "none" })
      wx.navigateTo({ url: "/pages/media/categories/index" })
      return
    }
    const mediaType = this.data.displayMode === "overview"
      ? this.data.overviewCategory || this.data.mediaTypes[0]
      : this.data.activeRecordType || this.data.mediaTypes[0]
    wx.removeStorageSync("MEDIA_EDIT_ITEM")
    wx.navigateTo({
      url: `/pages/media/edit/index?mediaType=${encodeURIComponent(mediaType)}`
    })
  },

  handleManageCategories() {
    if (!this.data.canWrite || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/media/categories/index" })
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    const entries = [
      ...this.data.overviewInProgressSource,
      ...this.data.overviewPlannedSource,
      ...this.data.recordSourceItems
    ]
    const item = entries.find((entry) => entry.id === id)
    if (!item) return
    if (EPISODIC_MEDIA_TYPES.includes(item.media_type)) {
      wx.navigateTo({ url: `/pages/media/detail/index?id=${id}` })
      return
    }
    if (!this.data.canWrite) return
    wx.setStorageSync("MEDIA_EDIT_ITEM", item)
    wx.navigateTo({ url: `/pages/media/edit/index?id=${id}` })
  },

  handleRetry() {
    void this.loadCurrentView({ refreshShared: !this.data.sharedLoaded })
  }
})

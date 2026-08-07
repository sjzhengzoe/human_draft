import { ensureLogin } from "../../services/auth"
import { listMediaCategories, listMediaEntries } from "../../services/media"
import type { MediaEntry, MediaStatus, MediaType } from "../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

type DisplayMode = "overview" | "record"

type DisplayMediaEntry = MediaEntry & {
  metaText: string
  statsText: string
  favoriteText: string
  recordDateText: string
}

const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"]
const PAGE_SIZE = 100

function timestamp(value: string): number {
  const result = Date.parse(value)
  return Number.isNaN(result) ? 0 : result
}

function formatRecordDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `最近记录 ${date.getMonth() + 1}月${date.getDate()}日`
}

function toDisplayEntry(entry: MediaEntry): DisplayMediaEntry {
  const isEpisodic = EPISODIC_MEDIA_TYPES.includes(entry.media_type)
  const platformText = entry.platforms.length ? entry.platforms.join(" / ") : "未记录平台"
  return {
    ...entry,
    metaText: `${entry.media_type} · ${platformText}`,
    statsText: isEpisodic
      ? `${entry.season_count || 0} 季 · ${entry.episode_count || 0} 集`
      : "",
    favoriteText: entry.favorite_episode_count
      ? `喜欢 ${entry.favorite_episode_count} 集`
      : "",
    recordDateText: formatRecordDate(entry.updated_at || entry.created_at)
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
    overviewCategoryOptions: ["全部分类"],
    overviewCategoryIndex: 0,
    overviewCategory: "" as MediaType,
    overviewInProgressSource: [] as DisplayMediaEntry[],
    overviewPlannedSource: [] as DisplayMediaEntry[],
    inProgressItems: [] as DisplayMediaEntry[],
    plannedItems: [] as DisplayMediaEntry[],
    activeRecordType: "" as MediaType,
    recordSourceItems: [] as DisplayMediaEntry[],
    recordItems: [] as DisplayMediaEntry[],
    keyword: "",
    appliedKeyword: "",
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    errorMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    void this.loadCurrentView()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadCurrentView() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    const displayMode = this.data.displayMode
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })

    try {
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
      const sharedData = {
        mediaTypes,
        overviewCategoryOptions: ["全部分类", ...mediaTypes],
        overviewCategoryIndex: overviewCategory ? mediaTypes.indexOf(overviewCategory) + 1 : 0,
        overviewCategory,
        activeRecordType,
        canWrite: session.user.can_write
      }

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
          inProgressItems: overviewCategory
            ? overviewInProgressSource.filter((item) => item.media_type === overviewCategory)
            : overviewInProgressSource,
          plannedItems: overviewCategory
            ? overviewPlannedSource.filter((item) => item.media_type === overviewCategory)
            : overviewPlannedSource
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
          )
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
    this.setData({ displayMode, errorMessage: "" }, () => {
      void this.loadCurrentView()
    })
  },

  handleOverviewCategoryChange(event: WechatMiniprogram.PickerChange) {
    const overviewCategoryIndex = Number(event.detail.value)
    const overviewCategory = overviewCategoryIndex
      ? this.data.mediaTypes[overviewCategoryIndex - 1] || ""
      : ""
    this.setData({
      overviewCategoryIndex,
      overviewCategory,
      inProgressItems: overviewCategory
        ? this.data.overviewInProgressSource.filter((item) => item.media_type === overviewCategory)
        : this.data.overviewInProgressSource,
      plannedItems: overviewCategory
        ? this.data.overviewPlannedSource.filter((item) => item.media_type === overviewCategory)
        : this.data.overviewPlannedSource
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
    void this.loadCurrentView()
  }
})

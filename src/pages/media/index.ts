import { ensureLogin } from "../../services/auth"
import { listMediaCategories, listMediaEntries, updateMediaEntry } from "../../services/media"
import type { MediaEntry, MediaStatus, MediaType } from "../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { getMediaDataRevision, markMediaDataChanged } from "../../utils/media-data-revision"

type DisplayMode = "overview" | "record"
type OverviewStatus = Extract<MediaStatus, "in_progress" | "planned">
type LoadCurrentViewOptions = { refreshShared?: boolean }

type DisplayMediaEntry = MediaEntry & {
  placeholderIcon: string
}

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
  return {
    ...entry,
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

function updateRevisitableValue(
  entries: DisplayMediaEntry[],
  id: string,
  isRevisitable: boolean
): DisplayMediaEntry[] {
  return entries.map((entry) =>
    entry.id === id ? { ...entry, is_revisitable: isRevisitable } : entry
  )
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
    selectedCategory: "" as MediaType,
    overviewStatus: "in_progress" as OverviewStatus,
    overviewInProgressSource: [] as DisplayMediaEntry[],
    overviewPlannedSource: [] as DisplayMediaEntry[],
    overviewItems: [] as DisplayMediaEntry[],
    recordSourceItems: [] as DisplayMediaEntry[],
    recordItems: [] as DisplayMediaEntry[],
    revisitableUpdatingId: "",
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
        selectedCategory: this.data.selectedCategory,
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
        const selectedCategory = mediaTypes.includes(this.data.selectedCategory)
          ? this.data.selectedCategory
          : ""
        sharedData = {
          mediaTypes,
          selectedCategory,
          canWrite: session.user.can_write,
          sharedLoaded: true
        }
      }

      const { selectedCategory } = sharedData

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
            selectedCategory,
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
            (!selectedCategory || item.media_type === selectedCategory) &&
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

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const selectedCategory = String(event.currentTarget.dataset.type || "")
    if (selectedCategory === this.data.selectedCategory) return
    this.setData({ selectedCategory }, () => {
      this.applyOverviewFilters()
      this.applyRecordFilters()
    })
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
        this.data.selectedCategory,
        this.data.overviewInProgressSource,
        this.data.overviewPlannedSource
      )
    })
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
    const selectedCategory = this.data.selectedCategory
    this.setData({
      recordItems: this.data.recordSourceItems.filter((item) =>
        (!selectedCategory || item.media_type === selectedCategory) &&
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
    const mediaType = this.data.selectedCategory || this.data.mediaTypes[0]
    wx.navigateTo({
      url: `/pages/media/edit/index?mediaType=${encodeURIComponent(mediaType)}`
    })
  },

  handleManageCategories() {
    if (!this.data.canWrite || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/media/categories/index" })
  },

  setRevisitableValue(id: string, isRevisitable: boolean) {
    this.setData({
      overviewInProgressSource: updateRevisitableValue(
        this.data.overviewInProgressSource,
        id,
        isRevisitable
      ),
      overviewPlannedSource: updateRevisitableValue(
        this.data.overviewPlannedSource,
        id,
        isRevisitable
      ),
      overviewItems: updateRevisitableValue(this.data.overviewItems, id, isRevisitable),
      recordSourceItems: updateRevisitableValue(
        this.data.recordSourceItems,
        id,
        isRevisitable
      ),
      recordItems: updateRevisitableValue(this.data.recordItems, id, isRevisitable)
    })
  },

  async handleRevisitableTap(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    if (!this.data.canWrite) {
      this.openMediaEntry(id)
      return
    }
    if (this.data.contentLoading || this.data.revisitableUpdatingId) return
    const entries = [
      ...this.data.overviewInProgressSource,
      ...this.data.overviewPlannedSource,
      ...this.data.recordSourceItems
    ]
    const entry = entries.find((item) => item.id === id)
    if (!entry) return
    const nextValue = !entry.is_revisitable
    this.setRevisitableValue(id, nextValue)
    this.setData({ revisitableUpdatingId: id })
    try {
      await updateMediaEntry(id, { is_revisitable: nextValue })
      const mediaRevision = markMediaDataChanged()
      this.setData({ mediaRevision })
    } catch (error) {
      this.setRevisitableValue(id, entry.is_revisitable)
      wx.showToast({
        title: error instanceof Error ? error.message : "更新失败",
        icon: "none"
      })
    } finally {
      this.setData({ revisitableUpdatingId: "" })
    }
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    this.openMediaEntry(id)
  },

  openMediaEntry(id: string) {
    if (!id) return
    wx.navigateTo({ url: `/pages/media/detail/index?id=${id}` })
  },

  handleRetry() {
    void this.loadCurrentView({ refreshShared: !this.data.sharedLoaded })
  }
})

import { ensureLogin } from "../../services/auth"
import {
  listMediaCategories,
  listMediaEntries,
  updateMediaEntry,
  reorderMediaEntrySortOrders
} from "../../services/life-lists"
import type {
  MediaEntry,
  MediaStatus,
  MediaType
} from "../../types/life-lists"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  invalidateAsyncPageRequests,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { findClosestSortTarget } from "../../utils/drag-sort"
import type { SortableRect } from "../../utils/drag-sort"

type StatusFilter = "all" | "revisitable" | MediaStatus
type LoadItemsOptions = { append?: boolean; reset?: boolean }
type MediaListSnapshot = {
  mediaTypes: MediaType[]
  activeType: MediaType
  statusFilter: StatusFilter
  isEpisodic: boolean
  isAudio: boolean
  keyword: string
  appliedKeyword: string
  items: MediaEntry[]
  page: number
  totalItems: number
  hasMore: boolean
  canWrite: boolean
  canReorder: boolean
}

const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"]
const PAGE_SIZE = 20

let dragSourceIndex = -1
let dragTargetIndex = -1
let dragRects: SortableRect[] = []
let dragItemIds: string[] = []
let suppressEditTapUntil = 0
let dragInsertAfter = false
let savedPageScrollTop = 0
let mediaListSnapshot: MediaListSnapshot | null = null

function snapshotMediaList(data: MediaListSnapshot): void {
  mediaListSnapshot = {
    ...data,
    mediaTypes: [...data.mediaTypes],
    items: [...data.items]
  }
}

function resetDragSession(): void {
  dragSourceIndex = -1
  dragTargetIndex = -1
  dragRects = []
  dragItemIds = []
  dragInsertAfter = false
}

Page({
  data: {
    mediaTypes: [] as MediaType[],
    activeType: "电影" as MediaType,
    statusFilter: "all" as StatusFilter,
    isEpisodic: false,
    isAudio: false,
    keyword: "",
    appliedKeyword: "",
    items: [] as MediaEntry[],
    page: 0,
    totalItems: 0,
    hasMore: false,
    loadingMore: false,
    canWrite: false,
    canReorder: false,
    draggingIndex: -1,
    dragTargetIndex: -1,
    dragInsertAfter: false,
    sorting: false,
    dragGhostVisible: false,
    dragGhostLabel: "",
    dragGhostX: 0,
    dragGhostY: 0,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    errorMessage: ""
  },

  onLoad() {
    savedPageScrollTop = 0
    if (mediaListSnapshot) {
      this.setData({
        ...mediaListSnapshot,
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        errorMessage: ""
      })
    }
  },

  onShow() {
    activateAsyncPage(this)
    this.loadItems()
  },

  onUnload() {
    if (this.data.hasLoaded) snapshotMediaList(this.data)
    deactivateAsyncPage(this)
    resetDragSession()
    savedPageScrollTop = 0
  },

  onPageScroll(event: { scrollTop: number }) {
    savedPageScrollTop = event.scrollTop
  },

  onReachBottom() {
    if (
      this.data.hasMore &&
      !this.data.contentLoading &&
      !this.data.loadingMore &&
      !this.data.sorting
    ) {
      this.loadItems({ append: true })
    }
  },

  async loadItems(options: LoadItemsOptions = {}) {
    const append = Boolean(options.append)
    if (
      append &&
      (!this.data.hasMore || this.data.contentLoading || this.data.loadingMore)
    ) return
    const generation = beginAsyncPageRequest(this)
    const statusFilter = this.data.statusFilter
    const showInitialLoading = !this.data.hasLoaded
    const scrollTopBeforeRefresh = savedPageScrollTop
    resetDragSession()
    if (append) {
      this.setData({ loadingMore: true })
    } else {
      this.setData({
        loading: showInitialLoading,
        contentLoading: !showInitialLoading && Boolean(options.reset),
        errorMessage: "",
        draggingIndex: -1,
        dragTargetIndex: -1
      })
    }
    try {
      const session = await ensureLogin()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const categories = await listMediaCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const mediaTypes = categories.map((category) => category.name)
      const activeType = mediaTypes.includes(this.data.activeType)
        ? this.data.activeType
        : mediaTypes[0] || ""
      const isEpisodic = EPISODIC_MEDIA_TYPES.includes(activeType)
      const isAudio = activeType === "广播剧"
      const refreshPageSize = !append && !options.reset && this.data.items.length
        ? Math.min(100, Math.max(PAGE_SIZE, this.data.items.length))
        : PAGE_SIZE
      const mediaPage = activeType
        ? await listMediaEntries({
            mediaType: activeType,
            status:
              statusFilter === "all" || statusFilter === "revisitable"
                ? undefined
                : statusFilter,
            revisitable: statusFilter === "revisitable",
            keyword: this.data.appliedKeyword || undefined,
            page: append ? this.data.page + 1 : 1,
            pageSize: append ? PAGE_SIZE : refreshPageSize
          })
        : null
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const items = mediaPage
        ? append
          ? [...this.data.items, ...mediaPage.items.filter((item) =>
              !this.data.items.some((current) => current.id === item.id)
            )]
          : mediaPage.items
        : []
      const totalItems = mediaPage?.pagination.total || 0
      const nextData = {
        mediaTypes,
        activeType,
        items,
        isEpisodic,
        isAudio,
        page: mediaPage ? Math.ceil(items.length / PAGE_SIZE) : 0,
        totalItems,
        hasMore: Boolean(mediaPage && items.length < totalItems),
        canWrite: session.user.can_write,
        canReorder:
          session.user.can_write &&
          statusFilter === "all" &&
          !this.data.appliedKeyword
      }
      this.setData(nextData)
      snapshotMediaList({ ...this.data, ...nextData })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({
          loading: false,
          contentLoading: false,
          loadingMore: false,
          hasLoaded: true
        }, () => {
          if (!append && !showInitialLoading && scrollTopBeforeRefresh > 0) {
            wx.pageScrollTo({ scrollTop: scrollTopBeforeRefresh, duration: 0 })
          }
        })
      }
    }
  },

  handleTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting) return
    const type = event.currentTarget.dataset.type as MediaType
    if (!type || type === this.data.activeType) return
    this.setData({
      activeType: type,
      statusFilter: "all",
      keyword: "",
      appliedKeyword: ""
    }, () => this.loadItems({ reset: true }))
  },

  handleStatusTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting) return
    const status = event.currentTarget.dataset.status as StatusFilter
    if (!status || status === this.data.statusFilter) return
    this.setData({ statusFilter: status }, () => this.loadItems({ reset: true }))
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value })
  },

  handleSearch() {
    if (this.data.sorting) return
    savedPageScrollTop = 0
    this.setData({ appliedKeyword: this.data.keyword.trim() }, () => {
      wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      this.loadItems({ reset: true })
    })
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.sorting || this.data.contentLoading) return
    wx.removeStorageSync("MEDIA_EDIT_ITEM")
    wx.navigateTo({
      url: `/pages/media/edit/index?mediaType=${encodeURIComponent(this.data.activeType)}`
    })
  },

  handleManageCategories() {
    if (!this.data.canWrite || this.data.sorting || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/media/categories/index" })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || Date.now() < suppressEditTapUntil) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    if (EPISODIC_MEDIA_TYPES.includes(item.media_type)) {
      wx.navigateTo({ url: "/pages/media/detail/index?id=" + id })
      return
    }
    if (!this.data.canWrite) return
    wx.setStorageSync("MEDIA_EDIT_ITEM", item)
    wx.navigateTo({ url: "/pages/media/edit/index?id=" + id })
  },

  async handleToggleRevisitable(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sorting) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    const nextValue = !item.is_revisitable
    this.setData({
      items: this.data.items.map((entry) =>
        entry.id === id ? { ...entry, is_revisitable: nextValue } : entry
      )
    })
    try {
      await updateMediaEntry(id, { is_revisitable: nextValue })
      if (this.data.statusFilter === "revisitable" && !nextValue) await this.loadItems()
    } catch (error) {
      if (!isAsyncPageActive(this)) return
      this.setData({
        items: this.data.items.map((entry) =>
          entry.id === id ? { ...entry, is_revisitable: !nextValue } : entry
        )
      })
      wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
    }
  },

  handleDragStart(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canReorder ||
      this.data.sorting ||
      this.data.loading ||
      this.data.contentLoading
    ) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.items.length) return

    dragSourceIndex = index
    dragTargetIndex = index
    dragItemIds = this.data.items.map((item) => item.id)
    suppressEditTapUntil = Date.now() + 1000
    const touch = event.touches[0] || event.changedTouches[0]
    invalidateAsyncPageRequests(this)
    this.setData({
      draggingIndex: index,
      dragTargetIndex: index,
      sorting: true,
      dragGhostVisible: true,
      dragGhostLabel: this.data.items[index].title,
      dragGhostX: touch?.clientX || 0,
      dragGhostY: touch?.clientY || 0
    })

    wx.createSelectorQuery()
      .selectAll(".js-sortable-media")
      .boundingClientRect((result) => {
        if (!isAsyncPageActive(this)) return
        const rects = result as unknown as SortableRect[]
        if (rects.length !== dragItemIds.length) {
          resetDragSession()
          this.setData({ draggingIndex: -1, dragTargetIndex: -1, sorting: false })
          return
        }
        dragRects = rects
      })
      .exec()
  },

  handleDragMove(event: WechatMiniprogram.TouchEvent) {
    if (dragSourceIndex < 0 || dragRects.length === 0) return
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) return
    this.setData({ dragGhostX: touch.clientX, dragGhostY: touch.clientY })
    const target = findClosestSortTarget(dragRects, touch.clientX, touch.clientY)
    if (target < 0) return
    const insertAfter = touch.clientY > (dragRects[target].top + dragRects[target].bottom) / 2
    if (target === dragTargetIndex && insertAfter === dragInsertAfter) return
    dragTargetIndex = target
    dragInsertAfter = insertAfter
    this.setData({ dragTargetIndex: target, dragInsertAfter: insertAfter })
  },

  handleDragCancel() {
    resetDragSession()
    this.setData({ draggingIndex: -1, dragTargetIndex: -1, sorting: false, dragGhostVisible: false })
  },

  async handleDragEnd() {
    const source = dragSourceIndex
    const target = dragTargetIndex
    const sourceId = dragItemIds[source] || ""
    const targetId = dragItemIds[target] || ""
    const insertAfter = dragInsertAfter
    resetDragSession()
    this.setData({ draggingIndex: -1, dragTargetIndex: -1, dragGhostVisible: false })
    if (
      source < 0 ||
      target < 0 ||
      source === target ||
      !sourceId ||
      !targetId
    ) {
      this.setData({ sorting: false })
      return
    }

    suppressEditTapUntil = Date.now() + 500
    const items = [...this.data.items]
    const currentSourceIndex = items.findIndex((item) => item.id === sourceId)
    const currentTargetIndex = items.findIndex((item) => item.id === targetId)
    if (currentSourceIndex < 0 || currentTargetIndex < 0) {
      this.setData({ sorting: false })
      return
    }
    const [sourceItem] = items.splice(currentSourceIndex, 1)
    const nextTargetIndex = items.findIndex((item) => item.id === targetId)
    items.splice(nextTargetIndex + (insertAfter ? 1 : 0), 0, sourceItem)
    this.setData({ items })
    try {
      await reorderMediaEntrySortOrders(this.data.activeType, items.map((item) => item.id))
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "排序失败", icon: "none" })
      }
    } finally {
      if (!isAsyncPageActive(this)) return
      await this.loadItems()
      if (isAsyncPageActive(this)) this.setData({ sorting: false })
    }
  }
})

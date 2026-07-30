import {
  getWardrobeStats,
  listWardrobeCategories,
  listWardrobeItems,
  reorderWardrobeItemSortOrders
} from "../../services/wardrobe"
import type {
  WardrobeCategory,
  WardrobeItem
} from "../../types/wardrobe"
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

type DisplayValue = { id: string; name: string; value: string }
type DisplayItem = WardrobeItem & { displayValues: DisplayValue[] }

let dragSourceIndex = -1
let dragTargetIndex = -1
let dragRects: SortableRect[] = []
let dragItemIds: string[] = []
let suppressItemTapUntil = 0
let dragInsertAfter = false
let wardrobeSortOriginalIds: string[] = []

function hasSameWardrobeOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function resetDragSession(): void {
  dragSourceIndex = -1
  dragTargetIndex = -1
  dragRects = []
  dragItemIds = []
  dragInsertAfter = false
}

function toDisplayItem(item: WardrobeItem): DisplayItem {
  return {
    ...item,
    displayValues: (item.category?.fields || [])
      .map((field) => ({
        id: field.id,
        name: field.name,
        value: item.values[field.id] || ""
      }))
      .filter((field) => field.value)
  }
}

Page({
  data: {
    categories: [] as WardrobeCategory[],
    items: [] as DisplayItem[],
    activeCategoryId: "",
    totalItemCount: 0,
    totalCategoryCount: 0,
    monthlyItemCount: 0,
    canReorder: false,
    sortEditing: false,
    draggingIndex: -1,
    dragTargetIndex: -1,
    dragInsertAfter: false,
    sorting: false,
    ordering: false,
    dragGhostVisible: false,
    dragGhostLabel: "",
    dragGhostX: 0,
    dragGhostY: 0,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    wardrobeSortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.refreshData()
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
    wardrobeSortOriginalIds = []
  },

  async refreshData() {
    const generation = beginAsyncPageRequest(this)
    const activeCategoryId = this.data.activeCategoryId
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const [categories, stats] = await Promise.all([
        listWardrobeCategories(),
        getWardrobeStats()
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const nextActiveCategoryId = categories.some(
        (category) => category.id === activeCategoryId
      )
        ? activeCategoryId
        : ""
      const items = await listWardrobeItems({
        categoryId: nextActiveCategoryId || undefined,
        sort: "custom"
      })
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        categories,
        items: items.map(toDisplayItem),
        activeCategoryId: nextActiveCategoryId,
        totalItemCount: stats.total_items,
        totalCategoryCount: stats.total_categories,
        monthlyItemCount: stats.monthly_items,
        canReorder: items.length > 1,
        draggingIndex: -1,
        dragTargetIndex: -1
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "衣橱加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    if (id === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: id }, () => this.refreshData())
  },

  handleManageCategories() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/wardrobe/categories/index" })
  },

  handleAddCategory() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/wardrobe/category-edit/index" })
  },

  handleAddItem() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    if (!this.data.categories.length) {
      wx.showModal({
        title: "先创建分类",
        content: "新增衣物前，需要先创建一个分类和对应的尺寸属性。",
        confirmText: "创建分类",
        success: (result) => {
          if (result.confirm && isAsyncPageActive(this)) this.handleAddCategory()
        }
      })
      return
    }
    const categoryId = this.data.activeCategoryId
    wx.navigateTo({
      url: `/pages/wardrobe/item-edit/index${
        categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""
      }`
    })
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    if (
      this.data.sorting ||
      this.data.sortEditing ||
      this.data.contentLoading ||
      Date.now() < suppressItemTapUntil
    ) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/wardrobe/item-edit/index?id=${id}` })
  },

  async handleSortEditingToggle() {
    if (!this.data.canReorder || this.data.contentLoading || this.data.ordering) return
    if (!this.data.sortEditing) {
      wardrobeSortOriginalIds = this.data.items.map((item) => item.id)
      this.setData({ sortEditing: true })
      return
    }
    const itemIds = this.data.items.map((item) => item.id)
    if (hasSameWardrobeOrder(wardrobeSortOriginalIds, itemIds)) {
      wardrobeSortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }
    this.setData({ ordering: true })
    try {
      await reorderWardrobeItemSortOrders(itemIds)
      if (!isAsyncPageActive(this)) return
      wardrobeSortOriginalIds = []
      this.setData({ sortEditing: false })
      wx.showToast({ title: "排序已保存", icon: "success" })
      await this.refreshData()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ ordering: false })
    }
  },

  handleMove(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const targetIndex = index + direction
    if (
      !this.data.canReorder ||
      !this.data.sortEditing ||
      this.data.ordering ||
      targetIndex < 0 ||
      targetIndex >= this.data.items.length
    ) return
    const items = [...this.data.items]
    const [item] = items.splice(index, 1)
    items.splice(targetIndex, 0, item)
    this.setData({ items })
  },

  handleDragStart(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canReorder ||
      !this.data.sortEditing ||
      this.data.sorting ||
      this.data.loading ||
      this.data.contentLoading
    ) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.items.length) return

    dragSourceIndex = index
    dragTargetIndex = index
    dragItemIds = this.data.items.map((item) => item.id)
    suppressItemTapUntil = Date.now() + 1000
    const touch = event.touches[0] || event.changedTouches[0]
    invalidateAsyncPageRequests(this)
    this.setData({
      draggingIndex: index,
      dragTargetIndex: index,
      sorting: true,
      dragGhostVisible: true,
      dragGhostLabel: this.data.items[index].name,
      dragGhostX: touch?.clientX || 0,
      dragGhostY: touch?.clientY || 0
    })

    wx.createSelectorQuery()
      .selectAll(".js-sortable-wardrobe")
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
    if (dragSourceIndex < 0 || !dragRects.length) return
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

  handleDragEnd() {
    const source = dragSourceIndex
    const target = dragTargetIndex
    const sourceId = dragItemIds[source] || ""
    const targetId = dragItemIds[target] || ""
    const insertAfter = dragInsertAfter
    resetDragSession()
    this.setData({ draggingIndex: -1, dragTargetIndex: -1, dragGhostVisible: false })
    if (source < 0 || target < 0 || source === target || !sourceId || !targetId) {
      this.setData({ sorting: false })
      return
    }

    suppressItemTapUntil = Date.now() + 500
    const items = [...this.data.items]
    const sourceIndex = items.findIndex((item) => item.id === sourceId)
    const targetIndex = items.findIndex((item) => item.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) {
      this.setData({ sorting: false })
      return
    }
    const [sourceItem] = items.splice(sourceIndex, 1)
    const nextTargetIndex = items.findIndex((item) => item.id === targetId)
    items.splice(nextTargetIndex + (insertAfter ? 1 : 0), 0, sourceItem)
    this.setData({ items, sorting: false })
  },

  handleRetry() {
    if (!this.data.sorting) this.refreshData()
  }
})

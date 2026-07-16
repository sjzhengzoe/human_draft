import { ensureLogin } from "../../services/auth"
import {
  listCategories,
  listDishes,
  reorderDishSortOrders
} from "../../services/menu"
import type { Category, Dish } from "../../types/api"
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

let dragSourceIndex = -1
let dragTargetIndex = -1
let dragRects: SortableRect[] = []
let dragItemIds: string[] = []
let suppressDishTapUntil = 0
let dragInsertAfter = false

function resetDragSession(): void {
  dragSourceIndex = -1
  dragTargetIndex = -1
  dragRects = []
  dragItemIds = []
  dragInsertAfter = false
}

Page({
  data: {
    categories: [] as Category[],
    dishes: [] as Dish[],
    activeCategoryId: "",
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

  onShow() {
    activateAsyncPage(this)
    this.refreshData()
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
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
      const session = await ensureLogin()
      const [categories, dishes] = await Promise.all([
        listCategories(),
        listDishes({
          category_id: activeCategoryId || undefined,
          sort: "custom",
          page_size: 100
        })
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        categories,
        dishes,
        canWrite: session.user.can_write,
        canReorder: session.user.can_write,
        draggingIndex: -1,
        dragTargetIndex: -1
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "菜单加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: id }, () => this.refreshData())
  },

  handleAddTap() {
    if (this.data.sorting || this.data.contentLoading) return
    if (!this.data.canWrite) {
      wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/menu/edit/index" })
  },

  handlePrintTap() {
    if (this.data.sorting || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/menu/print/index" })
  },

  handleDishTap(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      this.data.sorting ||
      this.data.contentLoading ||
      Date.now() < suppressDishTapUntil
    ) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
  },

  handleDragStart(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canReorder ||
      this.data.sorting ||
      this.data.loading ||
      this.data.contentLoading
    ) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.dishes.length) return

    dragSourceIndex = index
    dragTargetIndex = index
    dragItemIds = this.data.dishes.map((dish) => dish.id)
    suppressDishTapUntil = Date.now() + 1000
    const touch = event.touches[0] || event.changedTouches[0]
    invalidateAsyncPageRequests(this)
    this.setData({
      draggingIndex: index,
      dragTargetIndex: index,
      sorting: true,
      loading: false,
      dragGhostVisible: true,
      dragGhostLabel: this.data.dishes[index].name,
      dragGhostX: touch?.clientX || 0,
      dragGhostY: touch?.clientY || 0
    })

    wx.createSelectorQuery()
      .selectAll(".js-sortable-dish")
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

    suppressDishTapUntil = Date.now() + 500
    const dishes = [...this.data.dishes]
    const currentSourceIndex = dishes.findIndex((dish) => dish.id === sourceId)
    const currentTargetIndex = dishes.findIndex((dish) => dish.id === targetId)
    if (currentSourceIndex < 0 || currentTargetIndex < 0) {
      this.setData({ sorting: false })
      return
    }
    const [sourceDish] = dishes.splice(currentSourceIndex, 1)
    const nextTargetIndex = dishes.findIndex((dish) => dish.id === targetId)
    dishes.splice(nextTargetIndex + (insertAfter ? 1 : 0), 0, sourceDish)
    this.setData({ dishes })

    try {
      await reorderDishSortOrders(dishes.map((dish) => dish.id))
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (!isAsyncPageActive(this)) return
      await this.refreshData()
      if (isAsyncPageActive(this)) this.setData({ sorting: false })
    }
  },

  handleRetry() {
    if (this.data.sorting) return
    this.refreshData()
  }
})

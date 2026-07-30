import { ensureLogin } from "../../services/auth"
import {
  listCategories,
  listDishes,
  reorderDishSortOrders
} from "../../services/menu"
import { listDiningScenes } from "../../services/life-lists"
import type { Category, Dish, MealPeriod } from "../../types/api"
import type { DiningScene } from "../../types/life-lists"
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
let sortOriginalIds: string[] = []

type MealPeriodTag = {
  key: MealPeriod
  label: string
}

type MenuDish = Dish & {
  mealPeriodTags: MealPeriodTag[]
  recordTypeLabel: string
  recommendedLabel: string
}

const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
  breakfast: "早",
  lunch: "午",
  dinner: "晚"
}

function toMenuDish(dish: Dish): MenuDish {
  const mealPeriods =
    Array.isArray(dish.meal_periods) && dish.meal_periods.length > 0
      ? dish.meal_periods
      : []
  return {
    ...dish,
    recordTypeLabel: dish.record_type === "outside" ? "外食" : "在家",
    recommendedLabel: dish.recommended_items.join("、"),
    mealPeriodTags: mealPeriods
      .filter((key) => Boolean(MEAL_PERIOD_LABELS[key]))
      .map((key) => ({
        key,
        label: MEAL_PERIOD_LABELS[key]
      }))
  }
}

function resetDragSession(): void {
  dragSourceIndex = -1
  dragTargetIndex = -1
  dragRects = []
  dragItemIds = []
  dragInsertAfter = false
}

function hasSameDishOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

Page({
  data: {
    categories: [] as Category[],
    outsideCategories: [] as DiningScene[],
    dishes: [] as MenuDish[],
    activeFilter: "all",
    canWrite: false,
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
    this.refreshData()
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
    sortOriginalIds = []
  },

  async refreshData() {
    const generation = beginAsyncPageRequest(this)
    const activeFilter = this.data.activeFilter
    const homeCategoryId = activeFilter.startsWith("home:")
      ? activeFilter.slice("home:".length)
      : ""
    const outsideCategoryId = activeFilter.startsWith("outside:")
      ? activeFilter.slice("outside:".length)
      : ""
    const recordType = activeFilter === "home" || homeCategoryId
      ? "home"
      : activeFilter === "outside" || outsideCategoryId
        ? "outside"
        : undefined
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const session = await ensureLogin()
      const [categories, outsideCategories, dishes] = await Promise.all([
        listCategories(),
        listDiningScenes(),
        listDishes({
          category_id: homeCategoryId || undefined,
          outside_category_id: outsideCategoryId || undefined,
          record_type: recordType,
          sort: "custom",
          page_size: 100
        })
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        categories,
        outsideCategories,
        dishes: dishes.map(toMenuDish),
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

  handleFilterTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const filter = String(event.currentTarget.dataset.filter || "all")
    if (filter === this.data.activeFilter) return
    this.setData({ activeFilter: filter, sortEditing: false }, () => this.refreshData())
  },

  async handleSortEditingToggle() {
    if (!this.data.canReorder || this.data.contentLoading || this.data.ordering) return
    if (!this.data.sortEditing) {
      sortOriginalIds = this.data.dishes.map((dish) => dish.id)
      this.setData({ sortEditing: true })
      return
    }

    const dishIds = this.data.dishes.map((dish) => dish.id)
    if (hasSameDishOrder(sortOriginalIds, dishIds)) {
      sortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }

    this.setData({ ordering: true })
    try {
      await reorderDishSortOrders(dishIds)
      if (!isAsyncPageActive(this)) return
      sortOriginalIds = []
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

  handleAddTap() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    if (!this.data.canWrite) {
      wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/menu/edit/index" })
  },

  handlePrintTap() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/menu/print/index" })
  },

  handleDayPlanTap() {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/menu/day-plan/index" })
  },

  handleDishTap(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      this.data.sortEditing ||
      this.data.sorting ||
      this.data.contentLoading ||
      Date.now() < suppressDishTapUntil
    ) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
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
      targetIndex >= this.data.dishes.length
    ) return
    const dishes = [...this.data.dishes]
    const [dish] = dishes.splice(index, 1)
    dishes.splice(targetIndex, 0, dish)
    this.setData({ dishes })
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

  handleDragEnd() {
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
    this.setData({ dishes, sorting: false })
  },

  handleRetry() {
    if (this.data.sorting) return
    this.refreshData()
  }
})

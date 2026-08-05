import { ensureLogin } from "../../services/auth"
import {
  listCategories,
  listDishes,
  listMenuPlaces,
  reorderDishSortOrders,
  reorderMenuPlaceSortOrders
} from "../../services/menu"
import { listDiningScenes } from "../../services/life-lists"
import type {
  Category,
  Dish,
  MealPeriod,
  MenuPlace,
  MenuPlaceDishPreview
} from "../../types/api"
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
import {
  normalizeCookingTypes,
  normalizeTasteTags
} from "../../utils/menu-attributes"

let dragSourceIndex = -1
let dragTargetIndex = -1
let dragRects: SortableRect[] = []
let dragItemIds: string[] = []
let suppressDishTapUntil = 0
let dragInsertAfter = false
let sortOriginalIds: string[] = []
let outsideSortOriginalIds = new Map<string, string[]>()
let outsidePlaceOriginalIds: string[] = []

type MealPeriodTag = {
  key: MealPeriod
  label: string
}

type DisplayMode = "quick" | "browse"
type RecordTypeFilter = "all" | "home" | "outside"

type MenuDish = Dish & {
  mealPeriodTags: MealPeriodTag[]
  mealPeriodText: string
  mainIngredientText: string
  cookingMethodText: string
  tasteText: string
  recordTypeLabel: string
  displayCategory: string
  tasteTags: string[]
}

type QuickOutsideDish = MenuPlaceDishPreview & {
  mainIngredientText: string
  cookingMethodText: string
  tasteText: string
}

type QuickMenuPlace = Omit<MenuPlace, "dishes" | "preview_dishes"> & {
  dishes: QuickOutsideDish[]
  preview_dishes: QuickOutsideDish[]
}

const MEAL_PERIOD_TEXT: Record<MealPeriod, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  afternoon_tea: "下午茶",
  dinner: "晚餐"
}

function toMenuDish(dish: Dish): MenuDish {
  const mealPeriods =
    Array.isArray(dish.meal_periods) && dish.meal_periods.length > 0
      ? dish.meal_periods
      : []
  const cookingMethods = normalizeCookingTypes(dish.cooking_methods)
  const tasteTags = normalizeTasteTags(dish.taste)
  const displayCategory = dish.record_type === "outside"
    ? dish.outside_category?.name || "未分类"
    : dish.category?.name || "未分类"
  return {
    ...dish,
    cooking_methods: cookingMethods,
    tasteTags,
    recordTypeLabel: dish.record_type === "outside" ? "外食" : "在家",
    displayCategory,
    mealPeriodTags: mealPeriods
      .filter((key) => Boolean(MEAL_PERIOD_TEXT[key]))
      .map((key) => ({
        key,
        label: MEAL_PERIOD_TEXT[key]
      })),
    mealPeriodText: mealPeriods
      .filter((key) => Boolean(MEAL_PERIOD_TEXT[key]))
      .map((key) => MEAL_PERIOD_TEXT[key])
      .join("、"),
    mainIngredientText: dish.main_ingredients.slice(0, 3).join("、"),
    cookingMethodText: cookingMethods.join("、"),
    tasteText: tasteTags.join("、")
  }
}

function toQuickOutsideDish(dish: MenuPlaceDishPreview): QuickOutsideDish {
  const cookingMethods = normalizeCookingTypes(dish.cooking_methods)
  return {
    ...dish,
    mainIngredientText: dish.main_ingredients.slice(0, 3).join("、"),
    cookingMethodText: cookingMethods.join("、"),
    tasteText: normalizeTasteTags(dish.taste).join("、")
  }
}

function toQuickMenuPlace(place: MenuPlace): QuickMenuPlace {
  return {
    ...place,
    dishes: place.dishes.map(toQuickOutsideDish),
    preview_dishes: place.preview_dishes.map(toQuickOutsideDish)
  }
}

function recordTypeFromFilter(filter: string): RecordTypeFilter {
  if (filter === "home" || filter.startsWith("home:")) return "home"
  if (filter === "outside" || filter.startsWith("outside:")) return "outside"
  return "all"
}

function defaultCategoryFilter(
  recordType: RecordTypeFilter,
  categories: Category[],
  outsideCategories: DiningScene[]
) {
  if (recordType === "home" && categories[0]) return `home:${categories[0].id}`
  if (recordType === "outside" && outsideCategories[0]) return `outside:${outsideCategories[0].id}`
  return recordType
}

function resolveCategoryFilter(
  filter: string,
  categories: Category[],
  outsideCategories: DiningScene[]
) {
  const recordType = recordTypeFromFilter(filter)
  if (
    recordType === "home"
    && filter.startsWith("home:")
    && categories.some((category) => filter === `home:${category.id}`)
  ) return filter
  if (
    recordType === "outside"
    && filter.startsWith("outside:")
    && outsideCategories.some((category) => filter === `outside:${category.id}`)
  ) return filter
  return defaultCategoryFilter(recordType, categories, outsideCategories)
}

function getBrowsePosition(itemCount: number, requestedIndex: number) {
  if (itemCount <= 0) {
    return {
      browseCurrentIndex: 0
    }
  }
  const currentIndex = Math.min(Math.max(requestedIndex, 0), itemCount - 1)
  return {
    browseCurrentIndex: currentIndex
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
    outsidePlaces: [] as QuickMenuPlace[],
    homePlaceId: "",
    displayMode: "quick" as DisplayMode,
    browseCurrentIndex: 0,
    activeFilter: "home",
    activeRecordType: "home" as RecordTypeFilter,
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
    outsideSortOriginalIds.clear()
    outsidePlaceOriginalIds = []
  },

  async refreshData() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const session = await ensureLogin()
      const [categories, outsideCategories] = await Promise.all([
        listCategories(),
        listDiningScenes()
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const activeFilter = resolveCategoryFilter(
        this.data.activeFilter,
        categories,
        outsideCategories
      )
      const homeCategoryId = activeFilter.startsWith("home:")
        ? activeFilter.slice("home:".length)
        : ""
      const outsideCategoryId = activeFilter.startsWith("outside:")
        ? activeFilter.slice("outside:".length)
        : ""
      const activeRecordType = recordTypeFromFilter(activeFilter)
      const homePlaces = activeRecordType === "home"
        ? await listMenuPlaces({ place_type: "home" })
        : []
      const homePlaceId = homePlaces[0]?.id || ""
      const [dishes, outsidePlaces] = activeRecordType === "home"
        ? [await listDishes({
          place_id: homePlaceId || undefined,
          category_id: homeCategoryId || undefined,
          record_type: "home",
          sort: "custom",
          page_size: 100
        }), [] as MenuPlace[]]
        : [[], await listMenuPlaces({
          place_type: "outside",
          outside_category_id: outsideCategoryId || undefined
        })]
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const itemCount = activeRecordType === "outside" ? outsidePlaces.length : dishes.length
      const browsePosition = getBrowsePosition(itemCount, this.data.browseCurrentIndex)
      this.setData({
        categories,
        outsideCategories,
        dishes: dishes.map(toMenuDish),
        outsidePlaces: outsidePlaces.map(toQuickMenuPlace),
        homePlaceId,
        activeFilter,
        activeRecordType,
        ...browsePosition,
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
    this.setData({
      activeFilter: filter,
      activeRecordType: recordTypeFromFilter(filter),
      browseCurrentIndex: 0,
      sortEditing: false,
      contentLoading: true,
      errorMessage: ""
    }, () => this.refreshData())
  },

  handleRecordTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const recordType = String(event.currentTarget.dataset.type || "all") as RecordTypeFilter
    if (!["all", "home", "outside"].includes(recordType)) return
    if (recordType === this.data.activeRecordType) return
    const filter = defaultCategoryFilter(
      recordType,
      this.data.categories,
      this.data.outsideCategories
    )
    if (filter === this.data.activeFilter) return
    this.setData({
      activeFilter: filter,
      activeRecordType: recordType,
      browseCurrentIndex: 0,
      sortEditing: false,
      contentLoading: true,
      errorMessage: ""
    }, () => this.refreshData())
  },

  handleDisplayModeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const displayMode = String(event.currentTarget.dataset.mode || "quick") as DisplayMode
    if (displayMode !== "quick" && displayMode !== "browse") return
    if (displayMode === this.data.displayMode) return
    if (displayMode === "quick") {
      this.setData({ displayMode })
      return
    }
    this.setData({ displayMode })
  },

  async handleSortEditingToggle() {
    if (!this.data.canReorder || this.data.contentLoading || this.data.ordering) return
    if (!this.data.sortEditing) {
      if (this.data.activeRecordType === "outside") {
        outsidePlaceOriginalIds = this.data.outsidePlaces.map((place) => place.id)
        outsideSortOriginalIds = new Map(
          this.data.outsidePlaces.map((place) => [
            place.id,
            place.dishes.map((dish) => dish.id)
          ])
        )
        this.setData({ sortEditing: true, displayMode: "quick" })
        return
      }
      sortOriginalIds = this.data.dishes.map((dish) => dish.id)
      this.setData({ sortEditing: true, displayMode: "quick" })
      return
    }

    if (this.data.activeRecordType === "outside") {
      const placeIds = this.data.outsidePlaces.map((place) => place.id)
      const placeOrderChanged = !hasSameDishOrder(outsidePlaceOriginalIds, placeIds)
      const changedPlaces = this.data.outsidePlaces.filter((place) => !hasSameDishOrder(
        outsideSortOriginalIds.get(place.id) || [],
        place.dishes.map((dish) => dish.id)
      ))
      if (!placeOrderChanged && changedPlaces.length === 0) {
        outsideSortOriginalIds.clear()
        outsidePlaceOriginalIds = []
        this.setData({ sortEditing: false })
        return
      }

      this.setData({ ordering: true })
      try {
        const saveTasks = changedPlaces.map((place) =>
          reorderDishSortOrders(place.dishes.map((dish) => dish.id), place.id)
        )
        if (placeOrderChanged) saveTasks.push(reorderMenuPlaceSortOrders(placeIds))
        await Promise.all(saveTasks)
        if (!isAsyncPageActive(this)) return
        outsideSortOriginalIds.clear()
        outsidePlaceOriginalIds = []
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
      await reorderDishSortOrders(dishIds, this.data.homePlaceId)
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
    if (this.data.activeRecordType === "outside") {
      wx.navigateTo({ url: "/pages/menu/place-edit/index" })
      return
    }
    const suffix = this.data.homePlaceId ? `?placeId=${this.data.homePlaceId}` : ""
    wx.navigateTo({ url: `/pages/menu/edit/index${suffix}` })
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
      this.data.sortEditing ||
      this.data.sorting ||
      this.data.contentLoading ||
      Date.now() < suppressDishTapUntil
    ) return
    if (!this.data.canWrite) {
      wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
  },

  handleBrowseChange(event: WechatMiniprogram.SwiperChange) {
    const index = Number(event.detail.current)
    const itemCount = this.data.activeRecordType === "outside"
      ? this.data.outsidePlaces.length
      : this.data.dishes.length
    const browsePosition = getBrowsePosition(itemCount, index)
    if (browsePosition.browseCurrentIndex !== this.data.browseCurrentIndex) {
      this.setData(browsePosition)
    }
  },

  handleEditDishTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
  },

  handlePlaceTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sortEditing || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/place/index?id=${id}` })
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

  handleOutsideMove(event: WechatMiniprogram.TouchEvent) {
    const placeIndex = Number(event.currentTarget.dataset.placeIndex)
    const dishIndex = Number(event.currentTarget.dataset.dishIndex)
    const direction = Number(event.currentTarget.dataset.direction)
    const targetIndex = dishIndex + direction
    const place = this.data.outsidePlaces[placeIndex]
    if (
      !this.data.canReorder ||
      !this.data.sortEditing ||
      this.data.ordering ||
      !place ||
      targetIndex < 0 ||
      targetIndex >= place.dishes.length
    ) return

    const outsidePlaces = [...this.data.outsidePlaces]
    const dishes = [...place.dishes]
    const [dish] = dishes.splice(dishIndex, 1)
    dishes.splice(targetIndex, 0, dish)
    outsidePlaces[placeIndex] = { ...place, dishes }
    this.setData({ outsidePlaces })
  },

  handleOutsidePlaceMove(event: WechatMiniprogram.TouchEvent) {
    const placeIndex = Number(event.currentTarget.dataset.placeIndex)
    const direction = Number(event.currentTarget.dataset.direction)
    const targetIndex = placeIndex + direction
    if (
      !this.data.canReorder ||
      !this.data.sortEditing ||
      this.data.ordering ||
      targetIndex < 0 ||
      targetIndex >= this.data.outsidePlaces.length
    ) return

    const outsidePlaces = [...this.data.outsidePlaces]
    const [place] = outsidePlaces.splice(placeIndex, 1)
    outsidePlaces.splice(targetIndex, 0, place)
    this.setData({ outsidePlaces })
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

import {
  getMenuOverview,
  getMenuScheduleRange,
  listMenuFavorites,
  listDishes,
  listMenuPlaces,
  replaceMenuFavorites,
  replaceMenuScheduleMeal,
  reorderDishSortOrders,
  reorderMenuPlaceSortOrders
} from "../../services/menu"
import type {
  Category,
  Dish,
  MealPeriod,
  MenuFavorite,
  MenuPlace,
  MenuPlaceDishPreview,
  MenuScheduleItem,
  MenuScheduleSourceKind
} from "../../types/api"
import type { DiningScene } from "../../types/dining"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  invalidateAsyncPageRequests,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { findClosestSortTarget, hasSameOrder } from "../../utils/drag-sort"
import type { SortableRect } from "../../utils/drag-sort"
import {
  normalizeCookingTypes,
  normalizeTasteTags
} from "../../utils/menu-attributes"
import {
  getMenuDataRevision
} from "../../utils/menu-data-revision"

let dragSourceIndex = -1
let dragTargetIndex = -1
let dragRects: SortableRect[] = []
let dragItemIds: string[] = []
let suppressDishTapUntil = 0
let dragInsertAfter = false
let sortOriginalIds: string[] = []
let outsideSortOriginalIds = new Map<string, string[]>()
let outsidePlaceOriginalIds: string[] = []
let searchTimer: ReturnType<typeof setTimeout> | null = null
let searchRequestId = 0

type MealPeriodTag = {
  key: MealPeriod
  label: string
}

type DisplayMode = "quick" | "browse"
type RecordTypeFilter = "all" | "home" | "outside"

type MenuDish = Dish & {
  browseVisible: boolean
  mealPeriodTags: MealPeriodTag[]
  mealPeriodText: string
  mainIngredientText: string
  cookingMethodText: string
  tasteText: string
  recordTypeLabel: string
  displayCategory: string
  tasteTags: string[]
  selected: boolean
}

type QuickOutsideDish = MenuPlaceDishPreview & {
  mainIngredientText: string
  cookingMethodText: string
  tasteText: string
  selected: boolean
}

type QuickMenuPlace = Omit<MenuPlace, "dishes" | "preview_dishes"> & {
  browseVisible: boolean
  dishes: QuickOutsideDish[]
  preview_dishes: QuickOutsideDish[]
  selected: boolean
}

type SelectionItem = {
  key: string
  source_kind: MenuScheduleSourceKind
  record_type: "home" | "outside"
  dish_id: string | null
  place_id: string | null
  name: string
  place_name: string
  image_url: string
}

type SelectableFavorite = MenuFavorite & {
  selected: boolean
}

type CachedMenuContent = {
  revision: number
  cachedAt: number
  dishes: MenuDish[]
  outsidePlaces: QuickMenuPlace[]
}

const MEAL_PERIOD_TEXT: Record<MealPeriod, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  afternoon_tea: "下午茶",
  dinner: "晚餐"
}

const BROWSE_WINDOW_RADIUS = 1
const MENU_CACHE_MAX_AGE_MS = 5 * 60 * 1000
const menuContentCache = new Map<string, CachedMenuContent>()

function isBrowseItemVisible(index: number, currentIndex: number): boolean {
  return Math.abs(index - currentIndex) <= BROWSE_WINDOW_RADIUS
}

function applyBrowseWindow<T extends { browseVisible: boolean }>(
  items: T[],
  currentIndex: number
): T[] {
  return items.map((item, index) => ({
    ...item,
    browseVisible: isBrowseItemVisible(index, currentIndex)
  }))
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
    browseVisible: false,
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
    tasteText: tasteTags.join("、"),
    selected: false
  }
}

function toQuickOutsideDish(dish: MenuPlaceDishPreview): QuickOutsideDish {
  const cookingMethods = normalizeCookingTypes(dish.cooking_methods)
  return {
    ...dish,
    mainIngredientText: dish.main_ingredients.slice(0, 3).join("、"),
    cookingMethodText: cookingMethods.join("、"),
    tasteText: normalizeTasteTags(dish.taste).join("、"),
    selected: false
  }
}

function toQuickMenuPlace(place: MenuPlace): QuickMenuPlace {
  return {
    ...place,
    browseVisible: false,
    dishes: place.dishes.map(toQuickOutsideDish),
    preview_dishes: place.preview_dishes.map(toQuickOutsideDish),
    selected: false
  }
}

function recordTypeFromFilter(filter: string): RecordTypeFilter {
  if (filter === "home" || filter.startsWith("home:")) return "home"
  if (filter === "outside" || filter.startsWith("outside:")) return "outside"
  return "all"
}

function defaultCategoryFilter(
  recordType: RecordTypeFilter,
  categories: Category[]
) {
  if (recordType === "home" && categories[0]) return `home:${categories[0].id}`
  if (recordType === "outside") return "outside"
  return recordType
}

function resolveCategoryFilter(
  filter: string,
  categories: Category[],
  outsideCategories: DiningScene[]
) {
  const recordType = recordTypeFromFilter(filter)
  if (recordType === "outside" && filter === "outside") return filter
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
  return defaultCategoryFilter(recordType, categories)
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

function selectionKey(sourceKind: MenuScheduleSourceKind, id: string | null): string {
  return `${sourceKind}:${id || ""}`
}

function toSelectableFavorite(favorite: MenuFavorite): SelectableFavorite {
  return {
    ...favorite,
    selected: false
  }
}

function selectionFromDish(dish: Dish | MenuPlaceDishPreview, placeId: string | null = null): SelectionItem {
  const fullDish = dish as Dish
  const resolvedPlaceId = placeId || fullDish.place_id || null
  const recordType = fullDish.record_type || (resolvedPlaceId ? "outside" : "home")
  return {
    key: selectionKey("dish", dish.id),
    source_kind: "dish",
    record_type: recordType,
    dish_id: dish.id,
    place_id: resolvedPlaceId,
    name: dish.name,
    place_name: "",
    image_url: dish.thumbnail_url || dish.image_url || ""
  }
}

function selectionFromPlace(place: QuickMenuPlace): SelectionItem {
  return {
    key: selectionKey("place", place.id),
    source_kind: "place",
    record_type: "outside",
    dish_id: null,
    place_id: place.id,
    name: place.name,
    place_name: place.name,
    image_url: place.thumbnail_url || place.image_url || ""
  }
}

function selectionFromScheduleItem(item: MenuScheduleItem): SelectionItem {
  return {
    key: selectionKey(item.source_kind, item.source_kind === "dish" ? item.dish_id : item.place_id),
    source_kind: item.source_kind,
    record_type: item.record_type,
    dish_id: item.dish_id,
    place_id: item.place_id,
    name: item.name,
    place_name: item.place_name,
    image_url: item.image_url
  }
}

function selectionFromFavorite(item: MenuFavorite): SelectionItem {
  return {
    key: selectionKey(item.source_kind, item.source_kind === "dish" ? item.dish_id : item.place_id),
    source_kind: item.source_kind,
    record_type: item.record_type,
    dish_id: item.dish_id,
    place_id: item.place_id,
    name: item.name,
    place_name: item.source_kind === "place" ? item.name : "",
    image_url: item.image_url
  }
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
    metadataLoaded: false,
    loadedRevision: -1,
    lastLoadedAt: 0,
    errorMessage: "",
    searchKeyword: "",
    searching: false,
    selectionMode: false,
    selectionPurpose: "meal" as "meal" | "favorites",
    selectionDate: "",
    selectionPeriod: "lunch" as MealPeriod,
    selectionTitle: "选择菜品",
    selectionSlotCount: 3,
    selectionLoaded: false,
    selectedItems: [] as SelectionItem[],
    favorites: [] as SelectableFavorite[],
    showBasketDialog: false,
    savingSelection: false
  },

  onLoad(query: Record<string, string | undefined>) {
    const selectionMode = query.mode === "select" || query.mode === "favorites"
    if (!selectionMode) return
    const selectionPurpose = query.mode === "favorites" ? "favorites" : "meal"
    const selectionPeriod = ["breakfast", "lunch", "afternoon_tea", "dinner"].includes(query.period || "")
      ? query.period as MealPeriod
      : "lunch"
    const selectionDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date || "") ? query.date || "" : ""
    this.setData({
      selectionMode: true,
      selectionPurpose,
      selectionPeriod,
      selectionDate,
      selectionTitle: selectionPurpose === "favorites"
        ? "选择常吃"
        : `选择${MEAL_PERIOD_TEXT[selectionPeriod]}`,
      displayMode: "quick"
    })
  },

  onShow() {
    activateAsyncPage(this)
    if (this.data.selectionMode && !this.data.selectionLoaded) {
      this.loadSelectionContext()
    }
    const revisionChanged = this.data.loadedRevision !== getMenuDataRevision()
    const cacheExpired = Date.now() - this.data.lastLoadedAt > MENU_CACHE_MAX_AGE_MS
    if (!this.data.metadataLoaded || revisionChanged || cacheExpired) {
      menuContentCache.clear()
      this.refreshData(true)
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
    sortOriginalIds = []
    outsideSortOriginalIds.clear()
    outsidePlaceOriginalIds = []
    menuContentCache.clear()
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = null
    searchRequestId += 1
  },

  async loadSelectionContext() {
    try {
      const favorites = (await listMenuFavorites()).map(toSelectableFavorite)
      if (!isAsyncPageActive(this)) return
      if (this.data.selectionPurpose === "favorites") {
        this.setData({
          favorites,
          selectedItems: favorites.map(selectionFromFavorite),
          selectionLoaded: true
        }, () => this.applySelectionMarks())
        return
      }
      if (!this.data.selectionDate) {
        this.setData({ favorites, selectionLoaded: true })
        return
      }
      const schedule = await getMenuScheduleRange(this.data.selectionDate, this.data.selectionDate)
      if (!isAsyncPageActive(this)) return
      const meal = schedule.meals.find((item) => item.meal_period === this.data.selectionPeriod)
      this.setData({
        favorites,
        selectedItems: (meal?.items || []).map(selectionFromScheduleItem),
        selectionSlotCount: meal?.slot_count || 3,
        selectionLoaded: true
      }, () => this.applySelectionMarks())
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "已选菜单加载失败", icon: "none" })
        this.setData({ selectionLoaded: true })
      }
    }
  },

  applySelectionMarks() {
    if (!this.data.selectionMode) return
    const selected = new Set(this.data.selectedItems.map((item) => item.key))
    this.setData({
      dishes: this.data.dishes.map((dish) => ({
        ...dish,
        selected: selected.has(selectionKey("dish", dish.id))
      })),
      outsidePlaces: this.data.outsidePlaces.map((place) => ({
        ...place,
        selected: selected.has(selectionKey("place", place.id)),
        dishes: place.dishes.map((dish) => ({
          ...dish,
          selected: selected.has(selectionKey("dish", dish.id))
        })),
        preview_dishes: place.preview_dishes.map((dish) => ({
          ...dish,
          selected: selected.has(selectionKey("dish", dish.id))
        }))
      })),
      favorites: this.data.favorites.map((favorite) => ({
        ...favorite,
        selected: selected.has(selectionKey(
          favorite.source_kind,
          favorite.source_kind === "dish" ? favorite.dish_id : favorite.place_id
        ))
      }))
    })
  },

  async refreshData(reloadMetadata: boolean, allowCache = false) {
    const generation = beginAsyncPageRequest(this)
    const currentRevision = getMenuDataRevision()
    if (currentRevision !== this.data.loadedRevision) menuContentCache.clear()
    if (!reloadMetadata && allowCache) {
      const activeFilter = resolveCategoryFilter(
        this.data.activeFilter,
        this.data.categories,
        this.data.outsideCategories
      )
      const cached = menuContentCache.get(activeFilter)
      if (
        cached
        && cached.revision === currentRevision
        && Date.now() - cached.cachedAt <= MENU_CACHE_MAX_AGE_MS
      ) {
        const activeRecordType = recordTypeFromFilter(activeFilter)
        const itemCount = activeRecordType === "outside"
          ? cached.outsidePlaces.length
          : cached.dishes.length
        const browsePosition = getBrowsePosition(itemCount, this.data.browseCurrentIndex)
        this.setData({
          dishes: applyBrowseWindow(cached.dishes, browsePosition.browseCurrentIndex),
          outsidePlaces: applyBrowseWindow(
            cached.outsidePlaces,
            browsePosition.browseCurrentIndex
          ),
          activeFilter,
          activeRecordType,
          ...browsePosition,
          loading: false,
          contentLoading: false,
          hasLoaded: true,
          loadedRevision: currentRevision,
          lastLoadedAt: cached.cachedAt,
          errorMessage: ""
        }, () => this.applySelectionMarks())
        return
      }
    }
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      let categories = this.data.categories
      let outsideCategories = this.data.outsideCategories
      let homePlaceId = this.data.homePlaceId
      let activeFilter = resolveCategoryFilter(
        this.data.activeFilter,
        categories,
        outsideCategories
      )
      let activeRecordType = recordTypeFromFilter(activeFilter)
      let dishes: Dish[] = []
      let outsidePlaces: MenuPlace[] = []
      let canWrite = this.data.canWrite

      if (reloadMetadata) {
        const requestedCategoryId = this.data.activeFilter.includes(":")
          ? this.data.activeFilter.slice(this.data.activeFilter.indexOf(":") + 1)
          : undefined
        const requestedRecordType = recordTypeFromFilter(this.data.activeFilter)
        const overview = await getMenuOverview({
          record_type: requestedRecordType === "outside" ? "outside" : "home",
          category_id: requestedCategoryId
        })
        categories = overview.categories
        outsideCategories = overview.outsideCategories
        homePlaceId = overview.homePlaceId
        activeFilter = overview.activeFilter
        activeRecordType = overview.activeRecordType
        dishes = overview.dishes
        outsidePlaces = overview.outsidePlaces
        canWrite = overview.canWrite
      } else {
        const homeCategoryId = activeFilter.startsWith("home:")
          ? activeFilter.slice("home:".length)
          : ""
        const outsideCategoryId = activeFilter.startsWith("outside:")
          ? activeFilter.slice("outside:".length)
          : ""
        if (activeRecordType === "home") {
          dishes = await listDishes({
            place_id: homePlaceId || undefined,
            category_id: homeCategoryId || undefined,
            record_type: "home",
            sort: "custom",
            page_size: 100
          })
        } else {
          outsidePlaces = await listMenuPlaces({
            place_type: "outside",
            outside_category_id: outsideCategoryId || undefined
          })
        }
      }
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const itemCount = activeRecordType === "outside" ? outsidePlaces.length : dishes.length
      const browsePosition = getBrowsePosition(itemCount, this.data.browseCurrentIndex)
      const loadedRevision = getMenuDataRevision()
      const loadedAt = Date.now()
      const menuDishes = dishes.map(toMenuDish)
      const quickOutsidePlaces = outsidePlaces.map(toQuickMenuPlace)
      menuContentCache.set(activeFilter, {
        revision: loadedRevision,
        cachedAt: loadedAt,
        dishes: menuDishes,
        outsidePlaces: quickOutsidePlaces
      })
      const nextDishes = applyBrowseWindow(
        menuDishes,
        browsePosition.browseCurrentIndex
      )
      const nextOutsidePlaces = applyBrowseWindow(
        quickOutsidePlaces,
        browsePosition.browseCurrentIndex
      )
      const dataPatch: WechatMiniprogram.IAnyObject = {
        dishes: nextDishes,
        outsidePlaces: nextOutsidePlaces,
        homePlaceId,
        activeFilter,
        activeRecordType,
        ...browsePosition,
        canWrite,
        canReorder: canWrite,
        loadedRevision,
        lastLoadedAt: loadedAt,
        draggingIndex: -1,
        dragTargetIndex: -1
      }
      if (reloadMetadata) {
        Object.assign(dataPatch, {
          categories,
          outsideCategories,
          metadataLoaded: true
        })
      }
      this.setData(dataPatch, () => this.applySelectionMarks())
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

  handleSearchInput(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const searchKeyword = String(event.detail.value || "").trim()
    this.setData({ searchKeyword })
    if (searchTimer) clearTimeout(searchTimer)
    if (!searchKeyword) {
      this.setData({ searching: false }, () => this.refreshData(false, true))
      return
    }
    searchTimer = setTimeout(() => this.performSearch(searchKeyword), 260)
  },

  async performSearch(keyword: string) {
    const requestId = ++searchRequestId
    const recordType = this.data.activeRecordType
    this.setData({ searching: true, contentLoading: true, errorMessage: "" })
    try {
      if (recordType === "outside") {
        const places = await listMenuPlaces({ place_type: "outside" })
        if (requestId !== searchRequestId || keyword !== this.data.searchKeyword) return
        const normalized = keyword.toLocaleLowerCase()
        const matches = places.flatMap((place) => {
          const placeMatches = place.name.toLocaleLowerCase().includes(normalized)
          const matchingDishes = place.dishes.filter((dish) => dish.name.toLocaleLowerCase().includes(normalized))
          if (!placeMatches && !matchingDishes.length) return []
          return [{
            ...place,
            dishes: placeMatches ? place.dishes : matchingDishes,
            preview_dishes: placeMatches ? place.preview_dishes : matchingDishes.slice(0, 5)
          }]
        })
        this.setData({
          dishes: [],
          outsidePlaces: matches.map(toQuickMenuPlace),
          browseCurrentIndex: 0
        }, () => this.applySelectionMarks())
      } else {
        const dishes = await listDishes({ record_type: "home", sort: "custom", page_size: 100 })
        if (requestId !== searchRequestId || keyword !== this.data.searchKeyword) return
        const normalized = keyword.toLocaleLowerCase()
        this.setData({
          dishes: dishes.filter((dish) => dish.name.toLocaleLowerCase().includes(normalized)).map(toMenuDish),
          outsidePlaces: [],
          browseCurrentIndex: 0
        }, () => this.applySelectionMarks())
      }
    } catch (error) {
      if (requestId === searchRequestId && isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "搜索失败", icon: "none" })
      }
    } finally {
      if (requestId === searchRequestId && isAsyncPageActive(this)) {
        this.setData({ searching: false, contentLoading: false })
      }
    }
  },

  toggleSelection(item: SelectionItem) {
    const exists = this.data.selectedItems.some((selected) => selected.key === item.key)
    const selectedItems = exists
      ? this.data.selectedItems.filter((selected) => selected.key !== item.key)
      : [...this.data.selectedItems, item]
    this.setData({ selectedItems }, () => this.applySelectionMarks())
  },

  handleFavoriteQuickTap(event: WechatMiniprogram.TouchEvent) {
    const sourceKind = String(event.currentTarget.dataset.sourceKind || "") as MenuScheduleSourceKind
    const id = String(event.currentTarget.dataset.id || "")
    const key = selectionKey(sourceKind, id)
    const favorite = this.data.favorites.find((item) =>
      selectionKey(item.source_kind, item.source_kind === "dish" ? item.dish_id : item.place_id) === key
    )
    if (favorite) this.toggleSelection(selectionFromFavorite(favorite))
  },

  handleBasketOpen() {
    this.setData({ showBasketDialog: true })
  },

  handleBasketCancel() {
    this.setData({ showBasketDialog: false })
  },

  handleBasketRemove(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "")
    this.setData({
      selectedItems: this.data.selectedItems.filter((item) => item.key !== key)
    }, () => this.applySelectionMarks())
  },

  handleFavoritesManage() {
    wx.navigateTo({ url: "/pages/menu/favorites/index" })
  },

  async handleSelectionSave() {
    if (this.data.savingSelection) return
    this.setData({ savingSelection: true })
    const items = this.data.selectedItems.map((item) => item.source_kind === "dish"
      ? { source_kind: "dish" as const, dish_id: item.dish_id || undefined }
      : { source_kind: "place" as const, place_id: item.place_id || undefined })
    try {
      if (this.data.selectionPurpose === "favorites") {
        await replaceMenuFavorites(items)
      } else {
        await replaceMenuScheduleMeal({
          mealDate: this.data.selectionDate,
          mealPeriod: this.data.selectionPeriod,
          slotCount: Math.max(1, this.data.selectionSlotCount, items.length),
          items
        })
      }
      if (!isAsyncPageActive(this)) return
      this.setData({ showBasketDialog: false })
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ savingSelection: false })
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
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = null
    searchRequestId += 1
    this.setData({
      activeFilter: filter,
      activeRecordType: recordTypeFromFilter(filter),
      searchKeyword: "",
      browseCurrentIndex: 0,
      sortEditing: false,
      contentLoading: true,
      errorMessage: ""
    }, () => this.refreshData(false, true))
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
      this.data.categories
    )
    if (filter === this.data.activeFilter) return
    if (searchTimer) clearTimeout(searchTimer)
    searchTimer = null
    searchRequestId += 1
    this.setData({
      activeFilter: filter,
      activeRecordType: recordType,
      searchKeyword: "",
      browseCurrentIndex: 0,
      sortEditing: false,
      contentLoading: true,
      errorMessage: ""
    }, () => this.refreshData(false, true))
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
    if (displayMode === "browse" && this.data.searchKeyword) {
      if (searchTimer) clearTimeout(searchTimer)
      searchTimer = null
      searchRequestId += 1
      this.setData({ displayMode, searchKeyword: "" }, () => this.refreshData(false, true))
      return
    }
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
      const placeOrderChanged = !hasSameOrder(outsidePlaceOriginalIds, placeIds)
      const changedPlaces = this.data.outsidePlaces.filter((place) => !hasSameOrder(
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
        await this.refreshData(false)
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
    if (hasSameOrder(sortOriginalIds, dishIds)) {
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
      await this.refreshData(false)
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
    if (this.data.selectionMode) {
      const homeDish = this.data.dishes.find((dish) => dish.id === id)
      if (homeDish) {
        this.toggleSelection(selectionFromDish(homeDish))
        return
      }
      for (const place of this.data.outsidePlaces) {
        const outsideDish = place.dishes.find((dish) => dish.id === id)
        if (outsideDish) {
          this.toggleSelection(selectionFromDish(outsideDish, place.id))
          return
        }
      }
      return
    }
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
  },

  handleBrowseChange(event: WechatMiniprogram.SwiperChange) {
    const index = Number(event.detail.current)
    const itemCount = this.data.activeRecordType === "outside"
      ? this.data.outsidePlaces.length
      : this.data.dishes.length
    const browsePosition = getBrowsePosition(itemCount, index)
    if (browsePosition.browseCurrentIndex !== this.data.browseCurrentIndex) {
      const previousIndex = this.data.browseCurrentIndex
      const currentIndex = browsePosition.browseCurrentIndex
      const collectionKey = this.data.activeRecordType === "outside"
        ? "outsidePlaces"
        : "dishes"
      const items = this.data.activeRecordType === "outside"
        ? this.data.outsidePlaces
        : this.data.dishes
      const dataPatch: WechatMiniprogram.IAnyObject = { browseCurrentIndex: currentIndex }
      items.forEach((item, itemIndex) => {
        const wasVisible = isBrowseItemVisible(itemIndex, previousIndex)
        const shouldBeVisible = isBrowseItemVisible(itemIndex, currentIndex)
        if (wasVisible !== shouldBeVisible || item.browseVisible !== shouldBeVisible) {
          dataPatch[`${collectionKey}[${itemIndex}].browseVisible`] = shouldBeVisible
        }
      })
      this.setData(dataPatch)
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
    if (this.data.selectionMode) {
      const place = this.data.outsidePlaces.find((item) => item.id === id)
      if (place) this.toggleSelection(selectionFromPlace(place))
      return
    }
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
    this.refreshData(!this.data.metadataLoaded)
  }
})

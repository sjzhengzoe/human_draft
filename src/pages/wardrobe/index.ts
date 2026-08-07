import {
  listWardrobeCategories,
  listWardrobeItems
} from "../../services/wardrobe"
import type {
  WardrobeCategory,
  WardrobeItem
} from "../../types/wardrobe"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

type DisplayValue = {
  id: string
  name: string
  value: string
  rowHeightRpx: number
}

type DisplayItem = WardrobeItem & {
  categoryName: string
  displayValues: DisplayValue[]
  cardHeightRpx: number
}

const CARD_BASE_HEIGHT_RPX = 540
const EMPTY_MEASUREMENT_HEIGHT_RPX = 96
const MEASUREMENT_ROW_HEIGHT_RPX = 76
const MEASUREMENT_EXTRA_LINE_HEIGHT_RPX = 30

function textLineCount(text: string, charactersPerLine: number): number {
  return Math.max(1, Math.ceil(Array.from(text).length / charactersPerLine))
}

function measurementRowHeight(name: string, value: string): number {
  const lines = Math.max(
    textLineCount(name, 12),
    textLineCount(value, 18)
  )
  return MEASUREMENT_ROW_HEIGHT_RPX + (lines - 1) * MEASUREMENT_EXTRA_LINE_HEIGHT_RPX
}

function toDisplayItem(item: WardrobeItem): DisplayItem {
  const displayValues = (item.category?.fields || []).map((field) => {
    const value = String(item.values[field.id] || "").trim() || "—"
    return {
      id: field.id,
      name: field.name,
      value,
      rowHeightRpx: measurementRowHeight(field.name, value)
    }
  })
  const measurementHeight = displayValues.length
    ? displayValues.reduce((total, field) => total + field.rowHeightRpx, 0)
    : EMPTY_MEASUREMENT_HEIGHT_RPX

  return {
    ...item,
    categoryName: item.category?.name || "未分类",
    displayValues,
    cardHeightRpx: CARD_BASE_HEIGHT_RPX + measurementHeight
  }
}

Page({
  data: {
    categories: [] as WardrobeCategory[],
    items: [] as DisplayItem[],
    activeCategoryId: "",
    activeItemIndex: 0,
    swiperHeightRpx: CARD_BASE_HEIGHT_RPX + EMPTY_MEASUREMENT_HEIGHT_RPX,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    errorMessage: "",
    showCreateCategoryDialog: false
  },

  onShow() {
    activateAsyncPage(this)
    this.refreshData(true)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async refreshData(preserveActiveItem = true) {
    const generation = beginAsyncPageRequest(this)
    const activeItemId = preserveActiveItem
      ? this.data.items[this.data.activeItemIndex]?.id || ""
      : ""
    const activeCategoryId = this.data.activeCategoryId
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })

    try {
      const categories = await listWardrobeCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const nextActiveCategoryId = categories.some(
        (category) => category.id === activeCategoryId
      )
        ? activeCategoryId
        : ""
      const items = (await listWardrobeItems({
        categoryId: nextActiveCategoryId || undefined,
        sort: "custom"
      })).map(toDisplayItem)
      if (!isAsyncPageRequestCurrent(this, generation)) return

      const preservedIndex = activeItemId
        ? items.findIndex((item) => item.id === activeItemId)
        : -1
      const activeItemIndex = preservedIndex >= 0 ? preservedIndex : 0
      this.setData({
        categories,
        items,
        activeCategoryId: nextActiveCategoryId,
        activeItemIndex,
        swiperHeightRpx: items[activeItemIndex]?.cardHeightRpx || (
          CARD_BASE_HEIGHT_RPX + EMPTY_MEASUREMENT_HEIGHT_RPX
        )
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
    if (this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: id, activeItemIndex: 0 }, () => {
      this.refreshData(false)
    })
  },

  handleSwiperChange(event: WechatMiniprogram.SwiperChange) {
    const activeItemIndex = Number(event.detail.current)
    const activeItem = this.data.items[activeItemIndex]
    if (!activeItem) return
    this.setData({
      activeItemIndex,
      swiperHeightRpx: activeItem.cardHeightRpx
    })
  },

  handleManageCategories() {
    if (!this.data.contentLoading) {
      wx.navigateTo({ url: "/pages/wardrobe/categories/index" })
    }
  },

  handleAddItem() {
    if (this.data.contentLoading) return
    if (!this.data.categories.length) {
      this.setData({ showCreateCategoryDialog: true })
      return
    }
    const categoryId = this.data.activeCategoryId
    wx.navigateTo({
      url: `/pages/wardrobe/item-edit/index${
        categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ""
      }`
    })
  },

  handleEditItem(event: WechatMiniprogram.TouchEvent) {
    if (this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/wardrobe/item-edit/index?id=${id}` })
  },

  handleCreateCategoryDialogCancel() {
    this.setData({ showCreateCategoryDialog: false })
  },

  handleCreateCategoryDialogConfirm() {
    this.setData({ showCreateCategoryDialog: false })
    wx.navigateTo({ url: "/pages/wardrobe/category-edit/index" })
  },

  handleRetry() {
    this.refreshData(true)
  }
})

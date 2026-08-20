import {
  listWardrobeCategories,
  swapWardrobeCategorySortOrders
} from "../../../services/wardrobe"
import { getCurrentUser } from "../../../services/auth"
import type { WardrobeCategory } from "../../../types/wardrobe"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import {
  createDragSortController,
  createDragSortData,
  hasSameOrder
} from "../../../utils/drag-sort"
import { requireLoginForAction } from "../../../utils/login-required"

type DisplayCategory = WardrobeCategory & { fieldSummary: string }
let wardrobeCategorySortOriginalIds: string[] = []
const wardrobeCategoryDragSort = createDragSortController()

Page({
  data: {
    categories: [] as DisplayCategory[],
    totalFieldCount: 0,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    moving: false,
    sortEditing: false,
    guestMode: false,
    errorMessage: "",
    ...createDragSortData()
  },

  onShow() {
    activateAsyncPage(this)
    wardrobeCategorySortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    if (!getCurrentUser()) {
      this.setData({
        categories: [],
        totalFieldCount: 0,
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        guestMode: true,
        errorMessage: ""
      })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    this.loadCategories()
  },

  onUnload() {
    wardrobeCategoryDragSort.dispose()
    deactivateAsyncPage(this)
    wardrobeCategorySortOriginalIds = []
  },

  async loadCategories() {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const categories = await listWardrobeCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        categories: categories.map((category) => ({
          ...category,
          fieldSummary: category.fields.map((field) => field.name).join(" · ") || "暂无预设属性"
        })),
        totalFieldCount: categories.reduce(
          (total, category) => total + category.fields.length,
          0
        )
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "分类加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleAdd() {
    if (!requireLoginForAction(this)) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    if (!this.data.moving && !this.data.contentLoading) {
      wx.navigateTo({ url: "/pages/wardrobe/category-edit/index" })
    }
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.moving || this.data.contentLoading) return
    if (this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/wardrobe/category-edit/index?id=${id}` })
  },

  async handleSortEditingToggle() {
    if (!requireLoginForAction(this)) return
    if (this.data.moving || this.data.contentLoading) return
    if (!this.data.sortEditing) {
      wardrobeCategorySortOriginalIds = this.data.categories.map((category) => category.id)
      this.setData({ sortEditing: true })
      return
    }
    const desiredIds = this.data.categories.map((category) => category.id)
    if (hasSameOrder(wardrobeCategorySortOriginalIds, desiredIds)) {
      wardrobeCategorySortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }
    const workingIds = [...wardrobeCategorySortOriginalIds]
    this.setData({ moving: true })
    try {
      for (let index = 0; index < desiredIds.length; index += 1) {
        if (workingIds[index] === desiredIds[index]) continue
        const targetIndex = workingIds.indexOf(desiredIds[index])
        if (targetIndex < 0) throw new Error("分类排序数据已变化，请重新加载")
        await swapWardrobeCategorySortOrders(workingIds[index], workingIds[targetIndex])
        const currentId = workingIds[index]
        workingIds[index] = workingIds[targetIndex]
        workingIds[targetIndex] = currentId
        wardrobeCategorySortOriginalIds = [...workingIds]
      }
      if (!isAsyncPageActive(this)) return
      wardrobeCategorySortOriginalIds = []
      this.setData({ sortEditing: false })
      wx.showToast({ title: "排序已保存", icon: "success" })
      await this.loadCategories()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ moving: false })
    }
  },

  handleSortDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.sortEditing || this.data.moving || this.data.contentLoading) return
    const index = Number(event.currentTarget.dataset.index)
    const category = this.data.categories[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!category || !touch) return
    wardrobeCategoryDragSort.start(this, {
      items: this.data.categories,
      sourceIndex: index,
      keyOf: (item) => item.id,
      touch,
      selector: ".js-category-sort-item",
      title: category.name,
      meta: category.fieldSummary
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    wardrobeCategoryDragSort.move(this, event)
  },

  handleSortDragEnd() {
    const result = wardrobeCategoryDragSort.finish(this, this.data.categories, (item) => item.id)
    if (result) this.setData({ categories: result.items })
  },

  handleRetry() {
    this.loadCategories()
  }
})

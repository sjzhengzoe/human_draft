import {
  listWardrobeCategories,
  swapWardrobeCategorySortOrders
} from "../../../services/wardrobe"
import type { WardrobeCategory } from "../../../types/wardrobe"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type DisplayCategory = WardrobeCategory & { fieldSummary: string }
let wardrobeCategorySortOriginalIds: string[] = []

function hasSameCategoryOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

Page({
  data: {
    categories: [] as DisplayCategory[],
    totalFieldCount: 0,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    moving: false,
    sortEditing: false,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    wardrobeCategorySortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.loadCategories()
  },

  onUnload() {
    deactivateAsyncPage(this)
    wardrobeCategorySortOriginalIds = []
  },

  async loadCategories() {
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
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    if (!this.data.moving && !this.data.contentLoading) {
      wx.navigateTo({ url: "/pages/wardrobe/category-edit/index" })
    }
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.moving || this.data.contentLoading) return
    if (this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/wardrobe/category-edit/index?id=${id}` })
  },

  async handleSortEditingToggle() {
    if (this.data.moving || this.data.contentLoading) return
    if (!this.data.sortEditing) {
      wardrobeCategorySortOriginalIds = this.data.categories.map((category) => category.id)
      this.setData({ sortEditing: true })
      return
    }
    const desiredIds = this.data.categories.map((category) => category.id)
    if (hasSameCategoryOrder(wardrobeCategorySortOriginalIds, desiredIds)) {
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

  handleMove(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.sortEditing || this.data.moving || this.data.contentLoading) return
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const targetIndex = index + direction
    const source = this.data.categories[index]
    const target = this.data.categories[targetIndex]
    if (!source || !target) return

    const categories = [...this.data.categories]
    categories[index] = target
    categories[targetIndex] = source
    this.setData({ categories })
  },

  handleRetry() {
    this.loadCategories()
  }
})

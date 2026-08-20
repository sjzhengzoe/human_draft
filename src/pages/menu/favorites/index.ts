import { listMenuFavorites, replaceMenuFavorites } from "../../../services/menu"
import { getCurrentUser } from "../../../services/auth"
import type { MenuFavorite } from "../../../types/api"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"
import { requireLoginForAction } from "../../../utils/login-required"
import { createDragSortController, createDragSortData } from "../../../utils/drag-sort"

const favoriteDragSort = createDragSortController()

function toInput(item: MenuFavorite) {
  return item.source_kind === "dish"
    ? { source_kind: "dish" as const, dish_id: item.dish_id || undefined }
    : { source_kind: "place" as const, place_id: item.place_id || undefined }
}

Page({
  data: {
    items: [] as MenuFavorite[],
    loading: true,
    saving: false,
    guestMode: false,
    errorMessage: "",
    ...createDragSortData()
  },

  onShow() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.setData({ items: [], loading: false, guestMode: true, errorMessage: "" })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false })
    this.loadData()
  },
  onUnload() {
    favoriteDragSort.dispose()
    deactivateAsyncPage(this)
  },

  async loadData() {
    if (!getCurrentUser()) return
    this.setData({ loading: true, errorMessage: "" })
    try {
      const items = await listMenuFavorites()
      if (isAsyncPageActive(this)) this.setData({ items })
    } catch (error) {
      if (isAsyncPageActive(this)) this.setData({ errorMessage: error instanceof Error ? error.message : "常吃清单加载失败" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ loading: false })
    }
  },

  handleAdd() {
    if (!requireLoginForAction(this)) return
    wx.navigateTo({ url: "/pages/menu/index?mode=favorites" })
  },

  async saveItems(items: MenuFavorite[]) {
    if (!requireLoginForAction(this)) return
    if (this.data.saving) return
    const previous = this.data.items
    this.setData({ items, saving: true })
    try {
      const saved = await replaceMenuFavorites(items.map(toInput))
      if (isAsyncPageActive(this)) this.setData({ items: saved })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ items: previous })
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleRemove(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    const id = String(event.currentTarget.dataset.id || "")
    this.saveItems(this.data.items.filter((item) => item.id !== id))
  },

  handleSortDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.items[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!item || !touch) return
    favoriteDragSort.start(this, {
      items: this.data.items,
      sourceIndex: index,
      keyOf: (entry) => entry.id,
      touch,
      selector: ".js-favorite-sort-item",
      title: item.name,
      meta: item.source_kind === "place" ? "店铺" : "菜品"
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    favoriteDragSort.move(this, event)
  },

  handleSortDragEnd() {
    const result = favoriteDragSort.finish(this, this.data.items, (item) => item.id)
    if (result) void this.saveItems(result.items)
  }
})

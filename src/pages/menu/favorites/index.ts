import { listMenuFavorites, replaceMenuFavorites } from "../../../services/menu"
import type { MenuFavorite } from "../../../types/api"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"

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
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    this.loadData()
  },
  onUnload() { deactivateAsyncPage(this) },

  async loadData() {
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
    wx.navigateTo({ url: "/pages/menu/index?mode=favorites" })
  },

  async saveItems(items: MenuFavorite[]) {
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
    const id = String(event.currentTarget.dataset.id || "")
    this.saveItems(this.data.items.filter((item) => item.id !== id))
  },

  handleMove(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const target = index + direction
    if (target < 0 || target >= this.data.items.length) return
    const items = [...this.data.items]
    const [item] = items.splice(index, 1)
    items.splice(target, 0, item)
    this.saveItems(items)
  }
})

import { listDiningScenes, swapDiningSceneSortOrders } from "../../../services/dining"
import type { DiningScene } from "../../../types/dining"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { hasSameOrder } from "../../../utils/drag-sort"

let diningSceneSortOriginalIds: string[] = []

Page({
  data: {
    scenes: [] as DiningScene[],
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    moving: false,
    sortEditing: false,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    diningSceneSortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.loadScenes()
  },

  onUnload() {
    deactivateAsyncPage(this)
    diningSceneSortOriginalIds = []
  },

  async loadScenes() {
    const generation = beginAsyncPageRequest(this)
    const initial = !this.data.hasLoaded
    this.setData({ loading: initial, contentLoading: !initial, errorMessage: "" })
    try {
      const scenes = await listDiningScenes()
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ scenes })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({
          errorMessage: error instanceof Error ? error.message : "场景加载失败"
        })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleAdd() {
    if (this.data.moving) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/dining/scene-edit/index" })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.moving || this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/dining/scene-edit/index?id=${id}` })
  },

  async handleSortEditingToggle() {
    if (this.data.moving || this.data.contentLoading) return
    if (!this.data.sortEditing) {
      diningSceneSortOriginalIds = this.data.scenes.map((scene) => scene.id)
      this.setData({ sortEditing: true })
      return
    }
    const desiredIds = this.data.scenes.map((scene) => scene.id)
    if (hasSameOrder(diningSceneSortOriginalIds, desiredIds)) {
      diningSceneSortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }
    const workingIds = [...diningSceneSortOriginalIds]
    this.setData({ moving: true })
    try {
      for (let index = 0; index < desiredIds.length; index += 1) {
        if (workingIds[index] === desiredIds[index]) continue
        const targetIndex = workingIds.indexOf(desiredIds[index])
        if (targetIndex < 0) throw new Error("场景排序数据已变化，请重新加载")
        await swapDiningSceneSortOrders(workingIds[index], workingIds[targetIndex])
        const currentId = workingIds[index]
        workingIds[index] = workingIds[targetIndex]
        workingIds[targetIndex] = currentId
        diningSceneSortOriginalIds = [...workingIds]
      }
      if (!isAsyncPageActive(this)) return
      diningSceneSortOriginalIds = []
      this.setData({ sortEditing: false })
      wx.showToast({ title: "排序已保存", icon: "success" })
      await this.loadScenes()
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
    if (!this.data.sortEditing || this.data.moving) return
    const index = Number(event.currentTarget.dataset.index)
    const targetIndex = index + Number(event.currentTarget.dataset.direction)
    const source = this.data.scenes[index]
    const target = this.data.scenes[targetIndex]
    if (!source || !target) return
    const scenes = [...this.data.scenes]
    scenes[index] = target
    scenes[targetIndex] = source
    this.setData({ scenes })
  }
})

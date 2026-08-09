import {
  createLuggageScene,
  listLuggageScenes,
  reorderLuggageScenes
} from "../../../services/luggage"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { hasSameOrder } from "../../../utils/drag-sort"
import { getLuggageDataRevision } from "../../../utils/luggage-data-cache"

let luggageSceneSortOriginalIds: string[] = []

Page({
  data: {
    scenes: [] as Array<{ id: string; name: string; group_count: number; item_count: number }>,
    loading: true,
    hasLoaded: false,
    sceneCreating: false,
    sceneCreateVisible: false,
    savingOrder: false,
    sortEditing: false,
    luggageRevision: -1,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    if (this.data.sortEditing) return
    if (!this.data.hasLoaded || this.data.luggageRevision !== getLuggageDataRevision()) {
      void this.loadScenes()
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
    luggageSceneSortOriginalIds = []
  },

  async loadScenes(forceRefresh = false) {
    const generation = beginAsyncPageRequest(this)
    const initial = !this.data.hasLoaded
    this.setData({ loading: initial, errorMessage: "" })
    try {
      const scenes = await listLuggageScenes(forceRefresh)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        scenes: scenes.map((scene) => ({
          id: scene.id,
          name: scene.name,
          group_count: scene.groups.length,
          item_count: scene.groups.reduce((total, group) => total + group.items.length, 0)
        })),
        luggageRevision: getLuggageDataRevision()
      })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ errorMessage: error instanceof Error ? error.message : "场景加载失败" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false, hasLoaded: true })
    }
  },

  handleAdd() {
    if (this.data.savingOrder || this.data.sceneCreating) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    this.setData({ sceneCreateVisible: true })
  },

  closeSceneCreateDialog() {
    if (!this.data.sceneCreating) this.setData({ sceneCreateVisible: false })
  },

  async createScene(event: WechatMiniprogram.CustomEvent<{ name?: string }>) {
    const name = String(event.detail.name || "").trim()
    if (!name || this.data.sceneCreating) return
    this.setData({ sceneCreating: true })
    try {
      const scene = await createLuggageScene(name)
      if (!isAsyncPageActive(this)) return
      this.setData({
        scenes: [...this.data.scenes, {
          id: scene.id,
          name: scene.name,
          group_count: scene.groups.length,
          item_count: scene.groups.reduce((total, group) => total + group.items.length, 0)
        }],
        sceneCreateVisible: false,
        luggageRevision: getLuggageDataRevision()
      })
      wx.showToast({ title: "场景已创建", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ sceneCreating: false })
    }
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.savingOrder || this.data.sceneCreating || this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/luggage/scene-edit/index?id=${id}` })
  },

  handleSceneMove(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.sortEditing || this.data.savingOrder) return
    const index = Number(event.currentTarget.dataset.index)
    const targetIndex = index + Number(event.currentTarget.dataset.direction)
    const source = this.data.scenes[index]
    const target = this.data.scenes[targetIndex]
    if (!source || !target) return
    const scenes = [...this.data.scenes]
    scenes[index] = target
    scenes[targetIndex] = source
    this.setData({ scenes })
  },

  async handleSortEditingToggle() {
    if (
      this.data.savingOrder || this.data.sceneCreating ||
      this.data.loading || this.data.scenes.length < 2
    ) return
    if (!this.data.sortEditing) {
      luggageSceneSortOriginalIds = this.data.scenes.map((scene) => scene.id)
      this.setData({ sortEditing: true })
      return
    }

    const desiredIds = this.data.scenes.map((scene) => scene.id)
    if (hasSameOrder(luggageSceneSortOriginalIds, desiredIds)) {
      luggageSceneSortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }

    this.setData({ savingOrder: true })
    try {
      await reorderLuggageScenes(desiredIds)
      if (!isAsyncPageActive(this)) return
      luggageSceneSortOriginalIds = []
      this.setData({
        savingOrder: false,
        sortEditing: false,
        luggageRevision: getLuggageDataRevision()
      })
      wx.showToast({ title: "排序已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ savingOrder: false })
    }
  },

  handleRetry() {
    void this.loadScenes(true)
  }
})

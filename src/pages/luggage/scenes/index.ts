import {
  createLuggageScene,
  deleteLuggageScene,
  listLuggageScenes,
  reorderLuggageScenes,
  updateLuggageScene
} from "../../../services/luggage"
import { getCurrentUser } from "../../../services/auth"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { hasSameOrder } from "../../../utils/drag-sort"
import { getLuggageDataRevision } from "../../../utils/luggage-data-cache"
import { requireLoginForAction } from "../../../utils/login-required"

let luggageSceneSortOriginalIds: string[] = []

Page({
  data: {
    scenes: [] as Array<{ id: string; name: string; group_count: number; item_count: number }>,
    loading: true,
    hasLoaded: false,
    sceneSaving: false,
    sceneDialogVisible: false,
    sceneEditingId: "",
    sceneDialogName: "",
    deleting: false,
    deleteConfirmVisible: false,
    savingOrder: false,
    sortEditing: false,
    guestMode: false,
    luggageRevision: -1,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    if (this.data.sortEditing) return
    if (!getCurrentUser()) {
      this.setData({
        scenes: [],
        loading: false,
        hasLoaded: true,
        guestMode: true,
        errorMessage: ""
      })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    if (!this.data.hasLoaded || this.data.luggageRevision !== getLuggageDataRevision()) {
      void this.loadScenes()
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
    luggageSceneSortOriginalIds = []
  },

  async loadScenes(forceRefresh = false) {
    if (!getCurrentUser()) return
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
    if (!requireLoginForAction(this)) return
    if (this.data.savingOrder || this.data.sceneSaving || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    this.setData({
      sceneDialogVisible: true,
      sceneEditingId: "",
      sceneDialogName: ""
    })
  },

  closeSceneDialog() {
    if (!this.data.sceneSaving) this.setData({ sceneDialogVisible: false })
  },

  async saveScene(event: WechatMiniprogram.CustomEvent<{ name?: string }>) {
    if (!requireLoginForAction(this)) return
    const name = String(event.detail.name || "").trim()
    if (!name || this.data.sceneSaving) return
    const editingId = this.data.sceneEditingId
    const currentScene = this.data.scenes.find((scene) => scene.id === editingId)
    if (editingId && currentScene?.name === name) {
      this.setData({ sceneDialogVisible: false })
      return
    }
    this.setData({ sceneSaving: true })
    try {
      let scenes = this.data.scenes
      if (editingId) {
        await updateLuggageScene(editingId, name)
        scenes = scenes.map((scene) => scene.id === editingId ? { ...scene, name } : scene)
      } else {
        const scene = await createLuggageScene(name)
        scenes = [...scenes, {
          id: scene.id,
          name: scene.name,
          group_count: scene.groups.length,
          item_count: scene.groups.reduce((total, group) => total + group.items.length, 0)
        }]
      }
      if (!isAsyncPageActive(this)) return
      this.setData({
        scenes,
        sceneDialogVisible: false,
        sceneEditingId: "",
        sceneDialogName: "",
        luggageRevision: getLuggageDataRevision()
      })
      wx.showToast({ title: editingId ? "场景已保存" : "场景已创建", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ sceneSaving: false })
    }
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.savingOrder || this.data.sceneSaving || this.data.deleting || this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    if (id) {
      this.setData({
        sceneDialogVisible: true,
        sceneEditingId: id,
        sceneDialogName: name
      })
    }
  },

  openSceneDeleteConfirm() {
    if (!requireLoginForAction(this)) return
    if (!this.data.sceneEditingId || this.data.sceneSaving || this.data.deleting) return
    this.setData({ sceneDialogVisible: false, deleteConfirmVisible: true })
  },

  closeSceneDeleteConfirm() {
    if (!this.data.deleting) this.setData({ deleteConfirmVisible: false })
  },

  async confirmSceneDelete() {
    if (!requireLoginForAction(this)) return
    const id = this.data.sceneEditingId
    if (!id || this.data.sceneSaving || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteLuggageScene(id)
      if (!isAsyncPageActive(this)) return
      this.setData({
        scenes: this.data.scenes.filter((scene) => scene.id !== id),
        deleting: false,
        deleteConfirmVisible: false,
        sceneEditingId: "",
        sceneDialogName: "",
        luggageRevision: getLuggageDataRevision()
      })
      wx.showToast({ title: "场景已删除", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  },

  handleSceneMove(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (!this.data.sortEditing || this.data.savingOrder || this.data.deleting) return
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
    if (!requireLoginForAction(this)) return
    if (
      this.data.savingOrder || this.data.sceneSaving || this.data.deleting ||
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

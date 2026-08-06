import {
  createLuggageScene,
  deleteLuggageScene,
  listLuggageScenes,
  updateLuggageScene
} from "../../../services/luggage"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

Page({
  data: {
    id: "",
    name: "",
    groupCount: 0,
    itemCount: 0,
    loading: true,
    saving: false,
    deleting: false,
    deleteConfirmVisible: false,
    loadErrorVisible: false,
    loadErrorMessage: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({ id: query.id || "" })
    wx.setNavigationBarTitle({ title: this.data.id ? "编辑行李场景" : "新增行李场景" })
    if (this.data.id) this.loadScene()
    else this.setData({ loading: false })
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadScene() {
    const generation = beginAsyncPageRequest(this)
    try {
      const scenes = await listLuggageScenes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const scene = scenes.find((item) => item.id === this.data.id)
      if (!scene) throw new Error("场景不存在")
      this.setData({
        name: scene.name,
        groupCount: scene.groups.length,
        itemCount: scene.groups.reduce((total, group) => total + group.items.length, 0)
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        loadErrorVisible: true,
        loadErrorMessage: error instanceof Error ? error.message : "无法读取场景"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  async handleSave() {
    const name = this.data.name.trim()
    if (!name || this.data.saving || this.data.deleting) return
    this.setData({ saving: true })
    try {
      if (this.data.id) await updateLuggageScene(this.data.id, name)
      else await createLuggageScene(name)
      if (isAsyncPageActive(this)) wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete() {
    if (!this.data.id || this.data.saving || this.data.deleting) return
    this.setData({ deleteConfirmVisible: true })
  },

  closeDeleteConfirm() {
    if (!this.data.deleting) this.setData({ deleteConfirmVisible: false })
  },

  async confirmDelete() {
    if (!this.data.id || this.data.saving || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteLuggageScene(this.data.id)
      if (isAsyncPageActive(this)) wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  },

  closeLoadError() {
    this.setData({ loadErrorVisible: false })
    if (isAsyncPageActive(this)) wx.navigateBack()
  }
})

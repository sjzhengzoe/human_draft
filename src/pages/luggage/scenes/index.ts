import { listLuggageScenes } from "../../../services/luggage"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

Page({
  data: {
    scenes: [] as Array<{ id: string; name: string; group_count: number; item_count: number }>,
    loading: true,
    hasLoaded: false,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    this.loadScenes()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadScenes() {
    const generation = beginAsyncPageRequest(this)
    const initial = !this.data.hasLoaded
    this.setData({ loading: initial, errorMessage: "" })
    try {
      const scenes = await listLuggageScenes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ scenes: scenes.map((scene) => ({
        id: scene.id,
        name: scene.name,
        group_count: scene.groups.length,
        item_count: scene.groups.reduce((total, group) => total + group.items.length, 0)
      })) })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ errorMessage: error instanceof Error ? error.message : "场景加载失败" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false, hasLoaded: true })
    }
  },

  handleAdd() {
    wx.navigateTo({ url: "/pages/luggage/scene-edit/index" })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/luggage/scene-edit/index?id=${id}` })
  },

  handleRetry() {
    this.loadScenes()
  }
})

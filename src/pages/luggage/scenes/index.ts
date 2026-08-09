import { listLuggageScenes } from "../../../services/luggage"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { getLuggageDataRevision } from "../../../utils/luggage-data-cache"

Page({
  data: {
    scenes: [] as Array<{ id: string; name: string; group_count: number; item_count: number }>,
    loading: true,
    hasLoaded: false,
    luggageRevision: -1,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    if (!this.data.hasLoaded || this.data.luggageRevision !== getLuggageDataRevision()) {
      void this.loadScenes()
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
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
    wx.navigateTo({ url: "/pages/luggage/scene-edit/index" })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/luggage/scene-edit/index?id=${id}` })
  },

  handleRetry() {
    void this.loadScenes(true)
  }
})

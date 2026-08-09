import { ensureLogin } from "../../services/auth"
import { deleteDiningPlace, listDiningPlaces, listDiningScenes } from "../../services/dining"
import type { DiningPlace, DiningScene } from "../../types/dining"
import { UI_COLORS } from "../../styles/colors"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

type DiningPlaceView = DiningPlace & {
  supportsTakeout: boolean
  supportsDineIn: boolean
}

Page({
  data: {
    items: [] as DiningPlaceView[],
    scenes: [] as DiningScene[],
    activeSceneId: "",
    activeSceneName: "",
    takeoutCount: 0,
    dineInCount: 0,
    canWrite: false,
    loading: true,
    contentLoading: false,
    switchingScene: false,
    hasLoaded: false,
    deleting: false,
    errorMessage: ""
  },

  onShow() {
    activateAsyncPage(this)
    this.loadItems()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadItems() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const session = await ensureLogin()
      const scenes = await listDiningScenes()
      const activeSceneId = scenes.some((scene) => scene.id === this.data.activeSceneId) ? this.data.activeSceneId : (scenes[0]?.id || "")
      const items = activeSceneId ? await listDiningPlaces(activeSceneId) : []
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        items: items.map((item) => ({
          ...item,
          supportsTakeout: item.service_modes.includes("takeout"),
          supportsDineIn: item.service_modes.includes("dine_in")
        })),
        scenes,
        activeSceneId,
        activeSceneName: scenes.find((scene) => scene.id === activeSceneId)?.name || "用餐清单",
        takeoutCount: items.filter((item) => item.service_modes.includes("takeout")).length,
        dineInCount: items.filter((item) => item.service_modes.includes("dine_in")).length,
        canWrite: session.user.can_write
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, switchingScene: false, hasLoaded: true })
      }
    }
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading) return
    wx.removeStorageSync("DINING_EDIT_ITEM")
    wx.navigateTo({ url: `/pages/dining/edit/index?sceneId=${this.data.activeSceneId}` })
  },

  handleSceneTap(event: WechatMiniprogram.TouchEvent) {
    const activeSceneId = String(event.currentTarget.dataset.id || "")
    if (!activeSceneId || activeSceneId === this.data.activeSceneId) return
    this.setData({ activeSceneId, switchingScene: true }, () => this.loadItems())
  },

  handleManageScenes() {
    if (this.data.canWrite && !this.data.contentLoading) wx.navigateTo({ url: "/pages/dining/scenes/index" })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((place) => place.id === id)
    if (!item) return
    wx.setStorageSync("DINING_EDIT_ITEM", item)
    wx.navigateTo({ url: `/pages/dining/edit/index?id=${id}` })
  },

  handleDelete(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.contentLoading || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((place) => place.id === id)
    if (!item) return
    wx.showModal({
      title: "删除店铺",
      content: `确认删除“${item.name}”？`,
      confirmText: "删除",
      confirmColor: UI_COLORS.danger,
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ deleting: true })
        try {
          await deleteDiningPlace(id)
          if (isAsyncPageActive(this)) await this.loadItems()
        } catch (error) {
          if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
        } finally {
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
      }
    })
  }
})

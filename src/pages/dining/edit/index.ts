import { ensureLogin } from "../../../services/auth"
import {
  createDiningPlace,
  getDiningPlace,
  listDiningScenes,
  updateDiningPlace
} from "../../../services/dining"
import type { DiningMode, DiningPlace, DiningScene } from "../../../types/dining"
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
    sceneId: "",
    scenes: [] as DiningScene[],
    sceneNames: [] as string[],
    sceneIndex: 0,
    name: "",
    supportsTakeout: true,
    supportsDineIn: false,
    menuText: "",
    loading: true,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    void this.loadPage(query)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadPage(query: Record<string, string | undefined>) {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const session = await ensureLogin()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!session.user.can_write) {
        wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
        wx.navigateBack()
        return
      }

      const id = String(query.id || "")
      const scenes = await listDiningScenes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const requestedSceneId = String(query.sceneId || "")
      const sceneIndex = Math.max(0, scenes.findIndex((scene) => scene.id === requestedSceneId))
      this.setData({
        scenes,
        sceneNames: scenes.map((scene) => scene.name),
        sceneIndex,
        sceneId: scenes[sceneIndex]?.id || ""
      })
      if (!id) {
        wx.setNavigationBarTitle({ title: "新增店铺" })
        return
      }

      wx.setNavigationBarTitle({ title: "编辑店铺" })
      const stored = wx.getStorageSync("DINING_EDIT_ITEM") as DiningPlace | undefined
      if (stored?.id === id) this.applyPlace(stored)
      const place = await getDiningPlace(id)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyPlace(place)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取店铺",
        showCancel: false,
        success: () => {
          if (isAsyncPageActive(this)) wx.navigateBack()
        }
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  applyPlace(place: DiningPlace) {
    const sceneIndex = Math.max(0, this.data.scenes.findIndex((scene) => scene.id === place.scene_id))
    this.setData({
      id: place.id,
      sceneId: place.scene_id,
      sceneIndex,
      name: place.name,
      supportsTakeout: place.service_modes.includes("takeout"),
      supportsDineIn: place.service_modes.includes("dine_in"),
      menuText: place.menu_items.join("\n")
    })
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  handleMenuInput(event: WechatMiniprogram.Input) {
    this.setData({ menuText: event.detail.value })
  },

  handleSceneChange(event: WechatMiniprogram.PickerChange) {
    const sceneIndex = Number(event.detail.value)
    const scene = this.data.scenes[sceneIndex]
    if (scene) this.setData({ sceneIndex, sceneId: scene.id })
  },

  toggleTakeout() {
    this.setData({ supportsTakeout: !this.data.supportsTakeout })
  },

  toggleDineIn() {
    this.setData({ supportsDineIn: !this.data.supportsDineIn })
  },

  async handleSave() {
    if (this.data.loading || this.data.saving) return
    const name = this.data.name.trim()
    const modes: DiningMode[] = []
    if (this.data.supportsTakeout) modes.push("takeout")
    if (this.data.supportsDineIn) modes.push("dine_in")
    if (!name) {
      wx.showToast({ title: "请填写店铺名", icon: "none" })
      return
    }
    if (!this.data.sceneId) {
      wx.showToast({ title: "请选择所属场景", icon: "none" })
      return
    }
    if (modes.length === 0) {
      wx.showToast({ title: "请标记可外卖或可堂食", icon: "none" })
      return
    }
    const input = {
      name,
      scene_id: this.data.sceneId,
      service_modes: modes,
      menu_items: this.data.menuText
        .split(/[\n，,、]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中" })
    try {
      if (this.data.id) await updateDiningPlace(this.data.id, input)
      else await createDiningPlace(input)
      wx.removeStorageSync("DINING_EDIT_ITEM")
      if (isAsyncPageActive(this)) wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  }
})

import { FOOTPRINT_PROVINCES } from "../../../data/footprint-regions"
import { ensureLogin } from "../../../services/auth"
import {
  createFootprintCityPlace,
  deleteFootprintCityPlace,
  listFootprintCityPlaces,
  updateFootprintCityPlace
} from "../../../services/footprint"
import type {
  FootprintCityPlace,
  FootprintPlaceStatus
} from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

function findCity(cityCode: string) {
  for (const province of FOOTPRINT_PROVINCES) {
    const city = province.cities.find((item) => item.code === cityCode)
    if (city) return city
  }
  return undefined
}

function placeListView(items: FootprintCityPlace[], status: FootprintPlaceStatus) {
  return {
    visibleItems: items.filter((item) => item.status === status),
    plannedCount: items.filter((item) => item.status === "planned").length,
    visitedCount: items.filter((item) => item.status === "visited").length
  }
}

Page({
  data: {
    cityCode: "",
    cityName: "",
    items: [] as FootprintCityPlace[],
    visibleItems: [] as FootprintCityPlace[],
    activeStatus: "planned" as FootprintPlaceStatus,
    plannedCount: 0,
    visitedCount: 0,
    loading: true,
    saving: false,
    deleting: false,
    errorMessage: "",
    editorVisible: false,
    editorId: "",
    editorName: "",
    editorNote: "",
    editorStatus: "planned" as FootprintPlaceStatus,
    deleteConfirmVisible: false,
    pendingDeleteName: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const cityCode = String(query.cityCode || "")
    const city = findCity(cityCode)
    if (!city) {
      this.setData({ loading: false, errorMessage: "城市不存在" })
      return
    }
    this.setData({ cityCode, cityName: city.fullName })
    wx.setNavigationBarTitle({ title: `${city.name}地点` })
  },

  onShow() {
    activateAsyncPage(this)
    if (this.data.cityCode) void this.loadPlaces()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadPlaces() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true, errorMessage: "" })
    try {
      await ensureLogin()
      const items = await listFootprintCityPlaces(this.data.cityCode)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        items,
        ...placeListView(items, this.data.activeStatus)
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        errorMessage: error instanceof Error ? error.message : "城市地点加载失败"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false })
      }
    }
  },

  handleRetry() {
    void this.loadPlaces()
  },

  handleStatusTabTap(event: WechatMiniprogram.TouchEvent) {
    const status = event.currentTarget.dataset.status
    if (status !== "planned" && status !== "visited") return
    this.setData({
      activeStatus: status,
      ...placeListView(this.data.items, status)
    })
  },

  handleAdd() {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    this.setData({
      editorVisible: true,
      editorId: "",
      editorName: "",
      editorNote: "",
      editorStatus: this.data.activeStatus
    })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((place) => place.id === id)
    if (!item) return
    this.setData({
      editorVisible: true,
      editorId: item.id,
      editorName: item.name,
      editorNote: item.note,
      editorStatus: item.status
    })
  },

  handleEditorNameInput(event: WechatMiniprogram.Input) {
    this.setData({ editorName: event.detail.value })
  },

  handleEditorNoteInput(event: WechatMiniprogram.Input) {
    this.setData({ editorNote: event.detail.value })
  },

  handleEditorCancel() {
    if (this.data.saving || this.data.deleting) return
    this.setData({ editorVisible: false })
  },

  async handleEditorSave() {
    if (this.data.saving || this.data.deleting) return
    const name = this.data.editorName.trim()
    const note = this.data.editorNote.trim()
    if (!name) {
      wx.showToast({ title: "请填写地点名称", icon: "none" })
      return
    }
    this.setData({ saving: true })
    try {
      const item = this.data.editorId
        ? await updateFootprintCityPlace(this.data.editorId, { name, note })
        : await createFootprintCityPlace(this.data.cityCode, {
            name,
            note,
            status: this.data.editorStatus
          })
      if (!isAsyncPageActive(this)) return
      const items = [
        item,
        ...this.data.items.filter((place) => place.id !== item.id)
      ]
      this.setData({
        items,
        editorVisible: false,
        ...placeListView(items, this.data.activeStatus)
      })
      wx.showToast({ title: this.data.editorId ? "地点已更新" : "地点已添加", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "地点保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  async handlePlaceStatusToggle(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    const current = this.data.items.find((item) => item.id === id)
    if (!current) return
    const status: FootprintPlaceStatus =
      current.status === "planned" ? "visited" : "planned"
    this.setData({ saving: true })
    try {
      const item = await updateFootprintCityPlace(id, { status })
      if (!isAsyncPageActive(this)) return
      const items = [
        item,
        ...this.data.items.filter((place) => place.id !== item.id)
      ]
      this.setData({
        items,
        ...placeListView(items, this.data.activeStatus)
      })
      wx.showToast({
        title: status === "visited" ? "已标记为去过" : "已移回想去",
        icon: "success"
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "地点状态更新失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDeleteRequest() {
    if (!this.data.editorId || this.data.saving || this.data.deleting) return
    this.setData({
      editorVisible: false,
      deleteConfirmVisible: true,
      pendingDeleteName: this.data.editorName.trim()
    })
  },

  handleDeleteCancel() {
    if (this.data.deleting) return
    this.setData({ deleteConfirmVisible: false, editorVisible: true })
  },

  async handleDeleteConfirm() {
    const id = this.data.editorId
    if (!id || this.data.deleting || this.data.saving) return
    this.setData({ deleting: true })
    try {
      await deleteFootprintCityPlace(id)
      if (!isAsyncPageActive(this)) return
      const items = this.data.items.filter((item) => item.id !== id)
      this.setData({
        items,
        editorId: "",
        editorName: "",
        editorNote: "",
        deleteConfirmVisible: false,
        pendingDeleteName: "",
        ...placeListView(items, this.data.activeStatus)
      })
      wx.showToast({ title: "地点已删除", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "地点删除失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  }
})

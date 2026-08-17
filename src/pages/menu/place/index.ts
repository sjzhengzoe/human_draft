import { ensureLogin, getCurrentUser } from "../../../services/auth"
import { getMenuPlace, listDishes } from "../../../services/menu"
import type { MenuPlace, MenuPlaceDishPreview } from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { getMenuDataRevision } from "../../../utils/menu-data-revision"
import { cacheMenuPlace, getCachedMenuPlace } from "../../../utils/menu-data-store"

Page({
  data: {
    placeId: "",
    place: null as MenuPlace | null,
    dishes: [] as MenuPlaceDishPreview[],
    canWrite: false,
    loading: true,
    errorMessage: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({ placeId: query.id || "" })
  },

  onShow() {
    activateAsyncPage(this)
    const user = getCurrentUser()
    const cachedPlace = user
      ? getCachedMenuPlace(user.uid, getMenuDataRevision(), this.data.placeId)
      : null
    if (user && cachedPlace) {
      wx.setNavigationBarTitle({ title: cachedPlace.name })
      this.setData({
        place: cachedPlace,
        dishes: cachedPlace.dishes,
        canWrite: user.can_write,
        loading: false,
        errorMessage: ""
      })
      return
    }
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    if (!this.data.placeId) {
      this.setData({ loading: false, errorMessage: "店铺不存在" })
      return
    }
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true, errorMessage: "" })
    try {
      const [session, place, dishes] = await Promise.all([
        ensureLogin(),
        getMenuPlace(this.data.placeId),
        listDishes({ place_id: this.data.placeId, sort: "custom", page_size: 100 })
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      cacheMenuPlace(session.user.uid, getMenuDataRevision(), {
        ...place,
        dishes
      })
      wx.setNavigationBarTitle({ title: place.name })
      this.setData({
        place,
        dishes,
        canWrite: session.user.can_write
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ errorMessage: error instanceof Error ? error.message : "店铺加载失败" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleRetry() {
    this.loadData()
  },

  handleEditPlace() {
    if (!this.data.canWrite || !this.data.placeId) return
    wx.navigateTo({ url: `/pages/menu/place-edit/index?id=${this.data.placeId}` })
  },

  handleAddDish() {
    if (!this.data.canWrite || !this.data.placeId) return
    wx.navigateTo({ url: `/pages/menu/edit/index?placeId=${this.data.placeId}` })
  },

  handleDishTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite) return
    const id = String(event.currentTarget.dataset.id || "")
    if (id) wx.navigateTo({ url: `/pages/menu/edit/index?id=${id}` })
  }
})

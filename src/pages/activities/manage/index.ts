import { ensureLogin, getCurrentUser } from "../../../services/auth"
import {
  deleteActivityItem,
  listActivityItems,
  swapActivityItemSortOrders
} from "../../../services/activities"
import type { ActivityItem, ActivityType } from "../../../types/activities"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { requireLoginForAction } from "../../../utils/login-required"

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]

function activityType(value: string | undefined): ActivityType {
  return ACTIVITY_TYPES.includes(value as ActivityType) ? value as ActivityType : "室内"
}

Page({
  data: {
    activeType: "室内" as ActivityType,
    items: [] as ActivityItem[],
    loading: true,
    hasLoaded: false,
    ordering: false,
    deleting: false,
    showDeleteDialog: false,
    pendingDeleteId: "",
    pendingDeleteName: "",
    guestMode: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({ activeType: activityType(query.type) })
  },

  onShow() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.setData({ items: [], loading: false, hasLoaded: true, guestMode: true })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    void this.loadItems(this.data.hasLoaded)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadItems(silent = false) {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    if (!silent) this.setData({ loading: true })
    try {
      const [session, items] = await Promise.all([
        ensureLogin(),
        listActivityItems(this.data.activeType)
      ])
      if (!session.user.can_write) throw new Error("当前账号没有编辑权限")
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ items, hasLoaded: true })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "加载失败",
        icon: "none"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleBack() {
    if (this.data.ordering || this.data.deleting) return
    wx.navigateBack()
  },

  handleManagerEdit(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.ordering || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    wx.navigateTo({
      url: `/pages/activities/edit/index?id=${encodeURIComponent(id)}&type=${encodeURIComponent(this.data.activeType)}`
    })
  },

  async handleManagerMove(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.ordering) return
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const targetIndex = index + direction
    const source = this.data.items[index]
    const target = this.data.items[targetIndex]
    if (!source || !target) return
    this.setData({ ordering: true })
    try {
      await swapActivityItemSortOrders(source.id, target.id)
      if (!isAsyncPageActive(this)) return
      const items = [...this.data.items]
      items[index] = target
      items[targetIndex] = source
      this.setData({ items })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ ordering: false })
    }
  },

  handleDeleteRequest(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.deleting || this.data.ordering) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    this.setData({
      showDeleteDialog: true,
      pendingDeleteId: item.id,
      pendingDeleteName: item.name
    })
  },

  handleDeleteCancel() {
    if (this.data.deleting) return
    this.setData({
      showDeleteDialog: false,
      pendingDeleteId: "",
      pendingDeleteName: ""
    })
  },

  async handleDeleteConfirm() {
    const id = this.data.pendingDeleteId
    if (!id || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteActivityItem(id)
      if (!isAsyncPageActive(this)) return
      this.setData({
        items: this.data.items.filter((item) => item.id !== id),
        showDeleteDialog: false,
        pendingDeleteId: "",
        pendingDeleteName: ""
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  }
})

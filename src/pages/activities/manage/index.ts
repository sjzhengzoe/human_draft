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
import { createDragSortController, createDragSortData } from "../../../utils/drag-sort"

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]
const activityDragSort = createDragSortController()

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
    guestMode: false,
    ...createDragSortData()
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
    activityDragSort.dispose()
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

  handleSortDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.ordering || this.data.deleting) return
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.items[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!item || !touch) return
    activityDragSort.start(this, {
      items: this.data.items,
      sourceIndex: index,
      keyOf: (entry) => entry.id,
      touch,
      selector: ".js-activity-sort-item",
      title: item.name,
      meta: this.data.activeType
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    activityDragSort.move(this, event)
  },

  async handleSortDragEnd() {
    const previousItems = this.data.items
    const result = activityDragSort.finish(this, previousItems, (item) => item.id)
    if (!result) return
    this.setData({ ordering: true })
    this.setData({ items: result.items })
    try {
      const movingId = previousItems[result.sourceIndex]?.id || ""
      const direction = result.sourceIndex < result.targetIndex ? 1 : -1
      for (
        let index = result.sourceIndex + direction;
        index !== result.targetIndex + direction;
        index += direction
      ) {
        const targetId = previousItems[index]?.id || ""
        if (!movingId || !targetId) throw new Error("活动排序数据已变化，请重新加载")
        await swapActivityItemSortOrders(movingId, targetId)
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
        await this.loadItems(true)
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

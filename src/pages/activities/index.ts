import { ensureLogin } from "../../services/auth"
import {
  createActivityItem,
  deleteActivityItem,
  listActivityItems,
  swapActivityItemSortOrders,
  updateActivityItem
} from "../../services/activities"
import type { ActivityItem, ActivityType } from "../../types/activities"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { hasSameOrder } from "../../utils/drag-sort"
import { UI_COLORS } from "../../styles/colors"

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]
let activitySortOriginalIds: string[] = []

Page({
  data: {
    activityTypes: ACTIVITY_TYPES,
    activeType: "室内" as ActivityType,
    items: [] as ActivityItem[],
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    showEditor: false,
    editingId: "",
    editorName: "",
    editorType: "室内" as ActivityType,
    saving: false,
    deleting: false,
    ordering: false,
    sortEditing: false
  },

  onShow() {
    activateAsyncPage(this)
    activitySortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.loadItems()
  },

  onUnload() {
    deactivateAsyncPage(this)
    activitySortOriginalIds = []
  },

  async loadItems() {
    const generation = beginAsyncPageRequest(this)
    const activeType = this.data.activeType
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading
    })
    try {
      const session = await ensureLogin()
      const items = await listActivityItems(activeType)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ items, canWrite: session.user.can_write })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const type = event.currentTarget.dataset.type as ActivityType
    if (!type || type === this.data.activeType) return
    this.setData({ activeType: type, sortEditing: false }, () => this.loadItems())
  },

  async handleSortEditingToggle() {
    if (!this.data.canWrite || this.data.contentLoading || this.data.ordering) return
    if (!this.data.sortEditing) {
      activitySortOriginalIds = this.data.items.map((item) => item.id)
      this.setData({ sortEditing: true })
      return
    }

    const desiredIds = this.data.items.map((item) => item.id)
    if (hasSameOrder(activitySortOriginalIds, desiredIds)) {
      activitySortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }

    const workingIds = [...activitySortOriginalIds]
    this.setData({ ordering: true })
    try {
      for (let index = 0; index < desiredIds.length; index += 1) {
        if (workingIds[index] === desiredIds[index]) continue
        const targetIndex = workingIds.indexOf(desiredIds[index])
        if (targetIndex < 0) throw new Error("活动排序数据已变化，请重新加载")
        await swapActivityItemSortOrders(workingIds[index], workingIds[targetIndex])
        const currentId = workingIds[index]
        workingIds[index] = workingIds[targetIndex]
        workingIds[targetIndex] = currentId
        activitySortOriginalIds = [...workingIds]
      }
      if (!isAsyncPageActive(this)) return
      activitySortOriginalIds = []
      this.setData({ sortEditing: false })
      wx.showToast({ title: "排序已保存", icon: "success" })
      await this.loadItems()
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

  noop() {},

  handleAdd() {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    this.setData({
      showEditor: true,
      editingId: "",
      editorName: "",
      editorType: this.data.activeType
    })
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.loading || this.data.contentLoading || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    this.setData({
      showEditor: true,
      editingId: item.id,
      editorName: item.name,
      editorType: item.activity_type
    })
  },

  handleEditorNameInput(event: WechatMiniprogram.Input) {
    this.setData({ editorName: event.detail.value })
  },

  handleEditorTypeTap(event: WechatMiniprogram.TouchEvent) {
    this.setData({ editorType: event.currentTarget.dataset.type as ActivityType })
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ showEditor: false })
  },

  async saveEditor() {
    const name = this.data.editorName.trim()
    if (!name || this.data.saving) return
    this.setData({ saving: true })
    try {
      if (this.data.editingId) {
        await updateActivityItem(this.data.editingId, name, this.data.editorType)
      } else {
        await createActivityItem(name, this.data.editorType)
      }
      if (!isAsyncPageActive(this)) return
      this.setData({ showEditor: false, activeType: this.data.editorType })
      await this.loadItems()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.saving || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除活动",
      content: "删除后无法恢复。",
      confirmText: "删除",
      confirmColor: UI_COLORS.danger,
      success: async (result) => {
        if (!isAsyncPageActive(this)) return
        if (!result.confirm) {
          this.setData({ deleting: false })
          return
        }
        try {
          await deleteActivityItem(id)
          if (isAsyncPageActive(this)) await this.loadItems()
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
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ deleting: false })
      }
    })
  },

  handleMove(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      !this.data.sortEditing ||
      this.data.ordering ||
      this.data.contentLoading
    ) return
    const index = Number(event.currentTarget.dataset.index)
    const targetIndex = index + Number(event.currentTarget.dataset.direction)
    const source = this.data.items[index]
    const target = this.data.items[targetIndex]
    if (!source || !target) return
    const items = [...this.data.items]
    items[index] = target
    items[targetIndex] = source
    this.setData({ items })
  }
})

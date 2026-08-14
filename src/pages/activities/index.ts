import { ensureLogin } from "../../services/auth"
import { listActivityItems } from "../../services/activities"
import type { ActivityItem, ActivityType } from "../../types/activities"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]
type ActivityItemsByType = Record<ActivityType, ActivityItem[]>

function emptyActivityItemsByType(): ActivityItemsByType {
  return { 室内: [], 户外: [], 居家: [] }
}

function groupActivityItems(items: ActivityItem[]): ActivityItemsByType {
  const grouped = emptyActivityItemsByType()
  for (const item of items) grouped[item.activity_type].push(item)
  return grouped
}

Page({
  data: {
    activityTypes: ACTIVITY_TYPES,
    activeType: "室内" as ActivityType,
    itemsByType: emptyActivityItemsByType(),
    items: [] as ActivityItem[],
    canWrite: false,
    loading: true,
    hasLoaded: false
  },

  onShow() {
    activateAsyncPage(this)
    void this.loadItems(this.data.hasLoaded)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadItems(silent = false) {
    const generation = beginAsyncPageRequest(this)
    if (!silent) this.setData({ loading: true })
    try {
      const [session, items] = await Promise.all([
        ensureLogin(),
        listActivityItems()
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const itemsByType = groupActivityItems(items)
      const activeType = this.data.activeType
      this.setData({
        itemsByType,
        items: itemsByType[activeType],
        canWrite: session.user.can_write,
        hasLoaded: true
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!silent) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleTypeTap(event: WechatMiniprogram.TouchEvent) {
    const type = event.currentTarget.dataset.type as ActivityType
    if (!type || type === this.data.activeType) return
    const items = this.data.itemsByType[type]
    this.setData({ activeType: type, items })
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.loading) return
    wx.navigateTo({
      url: `/pages/activities/edit/index?type=${encodeURIComponent(this.data.activeType)}`,
      events: {
        saved: (result: { type?: ActivityType }) => {
          const type = result?.type
          if (type && ACTIVITY_TYPES.includes(type)) this.setData({ activeType: type })
        }
      }
    })
  },

  handleManagerOpen() {
    if (!this.data.canWrite || this.data.loading) return
    wx.navigateTo({
      url: `/pages/activities/manage/index?type=${encodeURIComponent(this.data.activeType)}`
    })
  }
})

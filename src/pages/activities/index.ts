import { ensureLogin } from "../../services/auth"
import {
  createActivityItem,
  deleteActivityItem,
  listActivityItems,
  replaceActivityItemImage,
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

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]
type ActivityItemsByType = Record<ActivityType, ActivityItem[]>

function emptyActivityItemsByType(): ActivityItemsByType {
  return {
    室内: [],
    户外: [],
    居家: []
  }
}

function groupActivityItems(items: ActivityItem[]): ActivityItemsByType {
  const grouped = emptyActivityItemsByType()
  for (const item of items) grouped[item.activity_type].push(item)
  return grouped
}

function sortActivityItems(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((left, right) =>
    left.sort_order - right.sort_order || right.created_at.localeCompare(left.created_at)
  )
}

Page({
  data: {
    activityTypes: ACTIVITY_TYPES,
    activeType: "室内" as ActivityType,
    itemsByType: emptyActivityItemsByType(),
    items: [] as ActivityItem[],
    canWrite: false,
    loading: true,
    hasLoaded: false,
    showEditor: false,
    editingId: "",
    editorName: "",
    editorIntroduction: "",
    editorType: "室内" as ActivityType,
    currentImageUrl: "",
    selectedImagePath: "",
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    showManager: false,
    showDeleteDialog: false,
    pendingDeleteId: "",
    pendingDeleteName: "",
    saving: false,
    deleting: false,
    ordering: false
  },

  onShow() {
    activateAsyncPage(this)
    if (!this.data.hasLoaded) this.loadItems()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadItems(silent = false) {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !silent && !this.data.hasLoaded
    if (showInitialLoading) this.setData({ loading: true })
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
        wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false })
      }
    }
  },

  handleTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.deleting || this.data.ordering) return
    const type = event.currentTarget.dataset.type as ActivityType
    if (!type || type === this.data.activeType) return
    const items = this.data.itemsByType[type]
    this.setData({
      activeType: type,
      items
    })
  },

  handleAdd() {
    if (!this.data.canWrite || this.data.loading || this.data.deleting) return
    this.setData({
      showEditor: true,
      editingId: "",
      editorName: "",
      editorIntroduction: "",
      editorType: this.data.activeType,
      currentImageUrl: "",
      selectedImagePath: ""
    })
  },

  openEditor(item: ActivityItem) {
    this.setData({
      showManager: false,
      showEditor: true,
      editingId: item.id,
      editorName: item.name,
      editorIntroduction: item.introduction || "",
      editorType: item.activity_type,
      currentImageUrl: item.image_url || "",
      selectedImagePath: ""
    })
  },

  handleManagerEdit(event: WechatMiniprogram.TouchEvent) {
    if (this.data.ordering || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (item) this.openEditor(item)
  },

  handleEditorNameInput(event: WechatMiniprogram.Input) {
    this.setData({ editorName: event.detail.value })
  },

  handleEditorIntroductionInput(event: WechatMiniprogram.Input) {
    this.setData({ editorIntroduction: event.detail.value })
  },

  handleEditorTypeTap(event: WechatMiniprogram.TouchEvent) {
    this.setData({ editorType: event.currentTarget.dataset.type as ActivityType })
  },

  applyActivityItemToCache(item: ActivityItem) {
    const itemsByType = emptyActivityItemsByType()
    for (const type of ACTIVITY_TYPES) {
      itemsByType[type] = this.data.itemsByType[type].filter((entry) => entry.id !== item.id)
    }
    itemsByType[item.activity_type] = sortActivityItems([
      ...itemsByType[item.activity_type],
      item
    ])
    this.setData({
      activeType: item.activity_type,
      itemsByType,
      items: itemsByType[item.activity_type]
    })
  },

  removeActivityItemFromCache(id: string) {
    const itemsByType = emptyActivityItemsByType()
    for (const type of ACTIVITY_TYPES) {
      itemsByType[type] = this.data.itemsByType[type].filter((item) => item.id !== id)
    }
    const activeType = this.data.activeType
    this.setData({
      itemsByType,
      items: itemsByType[activeType]
    })
  },

  closeEditor() {
    if (this.data.saving || this.data.selectingImage || this.data.showImageCropper) return
    this.setData({
      showEditor: false,
      selectedImagePath: "",
      currentImageUrl: ""
    })
  },

  handleChooseImage() {
    if (
      !this.data.canWrite ||
      this.data.saving ||
      this.data.selectingImage ||
      this.data.showImageCropper
    ) return
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const path = result.tempFiles[0]?.tempFilePath
        if (!path) {
          this.setData({ selectingImage: false })
          return
        }
        this.setData({
          selectingImage: false,
          showImageCropper: true,
          cropSourcePath: path
        })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleImageCropCancel() {
    this.setData({ showImageCropper: false, cropSourcePath: "" })
  },

  handleImageCropConfirm(
    event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>
  ) {
    const tempFilePath = event.detail.tempFilePath
    if (!tempFilePath) return
    this.setData({
      selectedImagePath: tempFilePath,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleImageCropError(
    event: WechatMiniprogram.CustomEvent<{ message?: string }>
  ) {
    wx.showToast({
      title: event.detail.message || "图片裁剪失败，请重试",
      icon: "none"
    })
  },

  async saveEditor() {
    const name = this.data.editorName.trim()
    const introduction = this.data.editorIntroduction.trim()
    if (!name || this.data.saving) {
      if (!name) wx.showToast({ title: "请填写活动名称", icon: "none" })
      return
    }
    this.setData({ saving: true })
    try {
      let item: ActivityItem
      if (this.data.editingId) {
        item = await updateActivityItem(this.data.editingId, {
          name,
          introduction,
          activityType: this.data.editorType
        })
        if (this.data.selectedImagePath) {
          item = await replaceActivityItemImage(item.id, this.data.selectedImagePath)
        }
      } else {
        item = await createActivityItem({
          name,
          introduction,
          activityType: this.data.editorType,
          imagePath: this.data.selectedImagePath || undefined
        })
      }
      if (!isAsyncPageActive(this)) return
      this.applyActivityItemToCache(item)
      this.setData({
        showEditor: false,
        selectedImagePath: "",
        currentImageUrl: ""
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none",
          duration: 2600
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleManagerOpen() {
    if (!this.data.canWrite || this.data.loading || this.data.deleting) return
    this.setData({ showManager: true })
  },

  handleManagerClose() {
    if (!this.data.ordering) this.setData({ showManager: false })
  },

  async handleManagerMove(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.ordering) return
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
      const itemsByType = {
        ...this.data.itemsByType,
        [this.data.activeType]: items
      }
      this.setData({ itemsByType, items })
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
    if (!this.data.canWrite || this.data.deleting || this.data.ordering) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.items.find((entry) => entry.id === id)
    if (!item) return
    this.setData({
      showManager: false,
      showDeleteDialog: true,
      pendingDeleteId: item.id,
      pendingDeleteName: item.name
    })
  },

  handleDeleteCancel() {
    if (!this.data.deleting) {
      this.setData({
        showDeleteDialog: false,
        pendingDeleteId: "",
        pendingDeleteName: ""
      })
    }
  },

  async handleDeleteConfirm() {
    const id = this.data.pendingDeleteId
    if (!id || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteActivityItem(id)
      if (!isAsyncPageActive(this)) return
      this.setData({
        showDeleteDialog: false,
        pendingDeleteId: "",
        pendingDeleteName: ""
      })
      this.removeActivityItemFromCache(id)
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

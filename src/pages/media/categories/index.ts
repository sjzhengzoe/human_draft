import {
  createMediaCategory,
  deleteMediaCategory,
  listMediaCategories,
  swapMediaCategorySortOrders,
  updateMediaCategory
} from "../../../services/media"
import { getCurrentUser } from "../../../services/auth"
import type { MediaCategory } from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import {
  createDragSortController,
  createDragSortData,
  hasSameOrder
} from "../../../utils/drag-sort"
import { requireLoginForAction } from "../../../utils/login-required"
import {
  getMediaDataRevision,
  markMediaDataChanged
} from "../../../utils/media-data-revision"

let mediaCategorySortOriginalIds: string[] = []
const mediaCategoryDragSort = createDragSortController()

Page({
  data: {
    categories: [] as MediaCategory[],
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    moving: false,
    sortEditing: false,
    editorVisible: false,
    editorId: "",
    editorName: "",
    editorCanSave: false,
    saving: false,
    deleteConfirmVisible: false,
    deleting: false,
    guestMode: false,
    mediaRevision: -1,
    errorMessage: "",
    ...createDragSortData()
  },

  onShow() {
    activateAsyncPage(this)
    mediaCategorySortOriginalIds = []
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    if (!getCurrentUser()) {
      this.setData({
        categories: [],
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        guestMode: true,
        errorMessage: ""
      })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    if (!this.data.hasLoaded || this.data.mediaRevision !== getMediaDataRevision()) {
      void this.loadCategories()
    }
  },

  onUnload() {
    mediaCategoryDragSort.dispose()
    deactivateAsyncPage(this)
    mediaCategorySortOriginalIds = []
  },

  async loadCategories() {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const categories = await listMediaCategories()
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ categories, mediaRevision: getMediaDataRevision() })
      }
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        const message = error instanceof Error ? error.message : "分类加载失败"
        if (showInitialLoading) this.setData({ errorMessage: message })
        else wx.showToast({ title: message, icon: "none" })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleAdd() {
    if (!requireLoginForAction(this)) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    if (!this.data.moving && !this.data.contentLoading) {
      this.setData({
        editorVisible: true,
        editorId: "",
        editorName: "",
        editorCanSave: false
      })
    }
  },

  handleEdit(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    if (this.data.moving || this.data.contentLoading) return
    if (this.data.sortEditing) return
    const id = String(event.currentTarget.dataset.id || "")
    const category = this.data.categories.find((item) => item.id === id)
    if (!category) return
    this.setData({
      editorVisible: true,
      editorId: category.id,
      editorName: category.name,
      editorCanSave: true
    })
  },

  handleEditorInput(event: WechatMiniprogram.Input) {
    const editorName = event.detail.value
    this.setData({ editorName, editorCanSave: Boolean(editorName.trim()) })
  },

  closeEditor() {
    if (this.data.saving || this.data.deleting) return
    this.setData({
      editorVisible: false,
      editorId: "",
      editorName: "",
      editorCanSave: false
    })
  },

  async saveEditor() {
    if (!requireLoginForAction(this)) return
    if (this.data.saving || this.data.deleting) return
    const name = this.data.editorName.trim()
    if (!name) {
      wx.showToast({ title: "请填写分类名称", icon: "none" })
      return
    }
    this.setData({ saving: true })
    try {
      if (this.data.editorId) await updateMediaCategory(this.data.editorId, name)
      else await createMediaCategory(name)
      const mediaRevision = markMediaDataChanged()
      const categories = await listMediaCategories()
      if (!isAsyncPageActive(this)) return
      this.setData({
        categories,
        mediaRevision,
        editorVisible: false,
        editorId: "",
        editorName: "",
        editorCanSave: false
      })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDeleteRequest() {
    if (!requireLoginForAction(this)) return
    if (!this.data.editorId || this.data.saving || this.data.deleting) return
    this.setData({ editorVisible: false, deleteConfirmVisible: true })
  },

  handleDeleteCancel() {
    if (this.data.deleting) return
    this.setData({ deleteConfirmVisible: false, editorVisible: true })
  },

  async handleDeleteConfirm() {
    if (!this.data.editorId || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteMediaCategory(this.data.editorId)
      const mediaRevision = markMediaDataChanged()
      const categories = await listMediaCategories()
      if (!isAsyncPageActive(this)) return
      this.setData({
        categories,
        mediaRevision,
        deleteConfirmVisible: false,
        editorId: "",
        editorName: "",
        editorCanSave: false
      })
      wx.showToast({ title: "已删除", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ deleteConfirmVisible: false, editorVisible: true })
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  },

  async handleSortEditingToggle() {
    if (!requireLoginForAction(this)) return
    if (this.data.moving || this.data.contentLoading) return
    if (!this.data.sortEditing) {
      mediaCategorySortOriginalIds = this.data.categories.map((category) => category.id)
      this.setData({ sortEditing: true })
      return
    }
    const desiredIds = this.data.categories.map((category) => category.id)
    if (hasSameOrder(mediaCategorySortOriginalIds, desiredIds)) {
      mediaCategorySortOriginalIds = []
      this.setData({ sortEditing: false })
      return
    }
    const workingIds = [...mediaCategorySortOriginalIds]
    this.setData({ moving: true })
    try {
      for (let index = 0; index < desiredIds.length; index += 1) {
        if (workingIds[index] === desiredIds[index]) continue
        const targetIndex = workingIds.indexOf(desiredIds[index])
        if (targetIndex < 0) throw new Error("分类排序数据已变化，请重新加载")
        await swapMediaCategorySortOrders(workingIds[index], workingIds[targetIndex])
        const currentId = workingIds[index]
        workingIds[index] = workingIds[targetIndex]
        workingIds[targetIndex] = currentId
        mediaCategorySortOriginalIds = [...workingIds]
      }
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      mediaCategorySortOriginalIds = []
      this.setData({
        sortEditing: false,
        mediaRevision
      })
      wx.showToast({ title: "排序已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ moving: false })
    }
  },

  handleSortDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.sortEditing || this.data.moving || this.data.contentLoading) return
    const index = Number(event.currentTarget.dataset.index)
    const category = this.data.categories[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!category || !touch) return
    mediaCategoryDragSort.start(this, {
      items: this.data.categories,
      sourceIndex: index,
      keyOf: (item) => item.id,
      touch,
      selector: ".js-category-sort-item",
      title: category.name,
      meta: "影视分类"
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    mediaCategoryDragSort.move(this, event)
  },

  handleSortDragEnd() {
    const result = mediaCategoryDragSort.finish(this, this.data.categories, (item) => item.id)
    if (result) this.setData({ categories: result.items })
  },

  handleRetry() {
    this.loadCategories()
  }
})

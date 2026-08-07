import {
  createMediaCategory,
  deleteMediaCategory,
  getMediaCategory,
  updateMediaCategory
} from "../../../services/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { markMediaDataChanged } from "../../../utils/media-data-revision"

Page({
  data: {
    categoryId: "",
    name: "",
    loading: false,
    saving: false,
    deleting: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const categoryId = query.id || ""
    this.setData({ categoryId })
    wx.setNavigationBarTitle({ title: categoryId ? "编辑影视分类" : "新增影视分类" })
    if (categoryId) this.loadCategory()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadCategory() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const category = await getMediaCategory(this.data.categoryId)
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ name: category.name })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({ title: "加载失败", content: error instanceof Error ? error.message : "无法读取分类", showCancel: false, success: () => isAsyncPageActive(this) && wx.navigateBack() })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  async handleSave() {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const name = this.data.name.trim()
    if (!name) {
      wx.showToast({ title: "请填写分类名称", icon: "none" })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.categoryId) await updateMediaCategory(this.data.categoryId, name)
      else await createMediaCategory(name)
      markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete() {
    if (!this.data.categoryId || this.data.loading || this.data.saving || this.data.deleting) return
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除分类",
      content: "只有分类下没有影视条目时才能删除。",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!isAsyncPageActive(this)) return
        if (!result.confirm) {
          this.setData({ deleting: false })
          return
        }
        try {
          await deleteMediaCategory(this.data.categoryId)
          markMediaDataChanged()
          if (isAsyncPageActive(this)) wx.navigateBack({ delta: 2 })
        } catch (error) {
          if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
        } finally {
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
      },
      fail: () => isAsyncPageActive(this) && this.setData({ deleting: false })
    })
  }
})

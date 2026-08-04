import { ensureLogin } from "../../../services/auth"
import { listDiningScenes } from "../../../services/life-lists"
import {
  createMenuPlace,
  deleteMenuPlace,
  getMenuPlace,
  replaceMenuPlaceImage,
  updateMenuPlace
} from "../../../services/menu"
import type { DiningScene } from "../../../types/life-lists"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

Page({
  data: {
    placeId: "",
    name: "",
    categories: [] as DiningScene[],
    categoryNames: [] as string[],
    categoryIndex: 0,
    currentImageUrl: "",
    selectedImagePath: "",
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    showDeleteDialog: false,
    loading: true,
    saving: false,
    deleting: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({ placeId: query.id || "" })
    wx.setNavigationBarTitle({ title: query.id ? "编辑店铺" : "新增店铺" })
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    const generation = beginAsyncPageRequest(this)
    try {
      const session = await ensureLogin()
      if (!session.user.can_write) {
        wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
        wx.navigateBack()
        return
      }
      const categories = await listDiningScenes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (this.data.placeId) {
        const place = await getMenuPlace(this.data.placeId)
        if (!isAsyncPageRequestCurrent(this, generation)) return
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex: Math.max(0, categories.findIndex((category) => category.id === place.outside_category_id)),
          name: place.name,
          currentImageUrl: place.image_url
        })
      } else {
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name)
        })
      }
    } catch (error) {
      wx.showToast({ title: error instanceof Error ? error.message : "店铺加载失败", icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ categoryIndex: Number(event.detail.value) })
  },

  handleChooseImage() {
    if (this.data.saving || this.data.deleting || this.data.selectingImage) return
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const path = result.tempFiles[0]?.tempFilePath
        if (!path) {
          this.setData({ selectingImage: false })
          return
        }
        this.setData({ selectingImage: false, showImageCropper: true, cropSourcePath: path })
      },
      fail: () => this.setData({ selectingImage: false })
    })
  },

  handleImageCropCancel() {
    this.setData({ showImageCropper: false, cropSourcePath: "" })
  },

  handleImageCropConfirm(event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>) {
    const path = event.detail.tempFilePath
    if (path) this.setData({ selectedImagePath: path, showImageCropper: false, cropSourcePath: "" })
  },

  handleImageCropError(event: WechatMiniprogram.CustomEvent<{ message?: string }>) {
    wx.showToast({ title: event.detail.message || "图片裁剪失败", icon: "none" })
  },

  async handleSave() {
    if (this.data.saving || this.data.deleting) return
    const name = this.data.name.trim()
    const category = this.data.categories[this.data.categoryIndex]
    if (!name) {
      wx.showToast({ title: "请填写店铺名", icon: "none" })
      return
    }
    if (!category) {
      wx.showToast({ title: "请选择外食分类", icon: "none" })
      return
    }
    if (!this.data.placeId && !this.data.selectedImagePath) {
      wx.showToast({ title: "请选择店铺图片", icon: "none" })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.placeId) {
        await updateMenuPlace(this.data.placeId, {
          name,
          outside_category_id: category.id
        })
        if (this.data.selectedImagePath) {
          await replaceMenuPlaceImage(this.data.placeId, this.data.selectedImagePath)
        }
      } else {
        await createMenuPlace({
          name,
          outsideCategoryId: category.id,
          imagePath: this.data.selectedImagePath
        })
      }
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
    if (this.data.placeId) this.setData({ showDeleteDialog: true })
  },

  handleDeleteCancel() {
    this.setData({ showDeleteDialog: false })
  },

  async handleDeleteConfirm() {
    if (!this.data.placeId || this.data.deleting) return
    this.setData({ deleting: true, showDeleteDialog: false })
    wx.showLoading({ title: "删除中", mask: true })
    try {
      await deleteMenuPlace(this.data.placeId)
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已删除", icon: "success" })
      wx.navigateBack({ delta: 2 })
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  }
})

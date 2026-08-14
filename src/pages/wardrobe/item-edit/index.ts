import {
  createWardrobeItem,
  deleteWardrobeItem,
  getWardrobeItem,
  listWardrobeCategories,
  replaceWardrobeItemImage,
  updateWardrobeItem
} from "../../../services/wardrobe"
import type { WardrobeCategory } from "../../../types/wardrobe"
import type { ImageCrop, ImageCropResult } from "../../../types/images"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { UI_COLORS } from "../../../styles/colors"

type FormField = { id: string; name: string; value: string }

function fieldsForCategory(
  category: WardrobeCategory | undefined,
  values: Record<string, string>
): FormField[] {
  return (category?.fields || []).map((field) => ({
    id: field.id,
    name: field.name,
    value: values[field.id] || ""
  }))
}

Page({
  data: {
    itemId: "",
    preferredCategoryId: "",
    categories: [] as WardrobeCategory[],
    categoryNames: [] as string[],
    categoryIndex: 0,
    name: "",
    currentImageUrl: "",
    selectedImagePath: "",
    selectedImageUploadPath: "",
    selectedImageCrop: null as ImageCrop | null,
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    allValues: {} as Record<string, string>,
    formFields: [] as FormField[],
    loading: true,
    saving: false,
    deleting: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const itemId = query.id || ""
    this.setData({
      itemId,
      preferredCategoryId: query.categoryId || ""
    })
    wx.setNavigationBarTitle({ title: itemId ? "编辑衣物" : "新增衣物" })
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const categories = await listWardrobeCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!categories.length) {
        wx.showModal({
          title: "暂无分类",
          content: "请先创建衣物分类。",
          showCancel: false,
          success: () => {
            if (isAsyncPageActive(this)) wx.navigateBack()
          }
        })
        return
      }

      if (this.data.itemId) {
        const item = await getWardrobeItem(this.data.itemId)
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const categoryIndex = Math.max(
          0,
          categories.findIndex((category) => category.id === item.category_id)
        )
        const category = categories[categoryIndex]
        this.setData({
          categories,
          categoryNames: categories.map((entry) => entry.name),
          categoryIndex,
          name: item.name,
          currentImageUrl: item.image_url,
          allValues: { ...item.values },
          formFields: fieldsForCategory(category, item.values)
        })
      } else {
        const preferredIndex = categories.findIndex(
          (category) => category.id === this.data.preferredCategoryId
        )
        const categoryIndex = Math.max(0, preferredIndex)
        this.setData({
          categories,
          categoryNames: categories.map((entry) => entry.name),
          categoryIndex,
          formFields: fieldsForCategory(categories[categoryIndex], {})
        })
      }
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取衣物",
        showCancel: false,
        success: () => {
          if (isAsyncPageActive(this)) wx.navigateBack()
        }
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    const categoryIndex = Number(event.detail.value)
    const category = this.data.categories[categoryIndex]
    if (!category) return
    this.setData({
      categoryIndex,
      formFields: fieldsForCategory(category, this.data.allValues)
    })
  },

  handleValueInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const field = this.data.formFields[index]
    if (!field) return
    const value = event.detail.value
    this.setData({
      [`formFields[${index}].value`]: value,
      allValues: { ...this.data.allValues, [field.id]: value }
    })
  },

  handleChooseImage() {
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.deleting ||
      this.data.selectingImage
    ) return
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["original"],
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
    event: WechatMiniprogram.CustomEvent<ImageCropResult>
  ) {
    const { tempFilePath, sourceFilePath, crop } = event.detail
    if (!tempFilePath || !sourceFilePath) return
    this.setData({
      selectedImagePath: tempFilePath,
      selectedImageUploadPath: sourceFilePath,
      selectedImageCrop: crop || null,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleImageCropError(
    event: WechatMiniprogram.CustomEvent<{ message?: string }>
  ) {
    wx.showToast({
      title: event.detail.message || "图片裁剪失败",
      icon: "none"
    })
  },

  async handleSave() {
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.deleting ||
      this.data.selectingImage ||
      this.data.showImageCropper
    ) return
    const name = this.data.name.trim()
    const category = this.data.categories[this.data.categoryIndex]
    if (!name) {
      wx.showToast({ title: "请填写衣物名称", icon: "none" })
      return
    }
    if (!category) {
      wx.showToast({ title: "请选择分类", icon: "none" })
      return
    }
    if (!this.data.itemId && !this.data.selectedImageUploadPath) {
      wx.showToast({ title: "请选择衣物图片", icon: "none" })
      return
    }
    const values = this.data.formFields.reduce<Record<string, string>>(
      (result, field) => {
        result[field.id] = field.value.trim()
        return result
      },
      {}
    )

    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.itemId) {
        await updateWardrobeItem(this.data.itemId, {
          name,
          category_id: category.id,
          values
        })
        if (this.data.selectedImageUploadPath) {
          await replaceWardrobeItemImage(
            this.data.itemId,
            this.data.selectedImageUploadPath,
            this.data.selectedImageCrop
          )
        }
      } else {
        await createWardrobeItem({
          name,
          categoryId: category.id,
          values,
          imagePath: this.data.selectedImageUploadPath,
          imageCrop: this.data.selectedImageCrop
        })
      }
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none",
          duration: 2600
        })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete() {
    if (!this.data.itemId || this.data.loading || this.data.saving || this.data.deleting) return
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除衣物",
      content: "删除后，图片和尺寸信息都无法恢复。",
      confirmText: "删除",
      confirmColor: UI_COLORS.danger,
      success: async (result) => {
        if (!isAsyncPageActive(this)) return
        if (!result.confirm) {
          this.setData({ deleting: false })
          return
        }
        wx.showLoading({ title: "删除中", mask: true })
        try {
          await deleteWardrobeItem(this.data.itemId)
          if (!isAsyncPageActive(this)) return
          wx.showToast({ title: "已删除", icon: "success" })
          wx.navigateBack()
        } catch (error) {
          if (isAsyncPageActive(this)) {
            wx.showToast({
              title: error instanceof Error ? error.message : "删除失败",
              icon: "none"
            })
          }
        } finally {
          wx.hideLoading()
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ deleting: false })
      }
    })
  }
})

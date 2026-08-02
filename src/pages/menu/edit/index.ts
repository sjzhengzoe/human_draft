import { ensureLogin } from "../../../services/auth"
import {
  createDish,
  deleteDish,
  getDish,
  listCategories,
  replaceDishImage,
  updateDish
} from "../../../services/menu"
import { listDiningScenes } from "../../../services/life-lists"
import type { Category, MealPeriod, MenuRecordType } from "../../../types/api"
import type { DiningScene } from "../../../types/life-lists"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type MealPeriodOption = {
  key: MealPeriod
  label: string
  selected: boolean
}

const DEFAULT_MEAL_OPTIONS: MealPeriodOption[] = [
  { key: "breakfast", label: "早餐", selected: false },
  { key: "lunch", label: "午餐", selected: true },
  { key: "dinner", label: "晚餐", selected: true }
]

Page({
  data: {
    dishId: "",
    categories: [] as Category[],
    categoryNames: [] as string[],
    categoryIndex: 0,
    outsideCategories: [] as DiningScene[],
    outsideCategoryNames: [] as string[],
    outsideCategoryIndex: 0,
    recordType: "home" as MenuRecordType,
    name: "",
    recommendedText: "",
    mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({ ...option })),
    currentImageUrl: "",
    selectedImagePath: "",
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    loading: true,
    saving: false,
    deleting: false,
    canWrite: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const dishId = query.id || ""
    this.setData({ dishId })
    this.updatePageTitle("home")
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    const generation = beginAsyncPageRequest(this)
    try {
      const session = await ensureLogin()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!session.user.can_write) {
        wx.showToast({ title: "当前账号只有查看权限", icon: "none" })
        wx.navigateBack()
        return
      }

      const [categories, outsideCategories] = await Promise.all([
        listCategories(),
        listDiningScenes()
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (this.data.dishId) {
        const dish = await getDish(this.data.dishId)
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const categoryIndex = Math.max(
          0,
          categories.findIndex((category) => category.id === dish.category_id)
        )
        const outsideCategoryIndex = Math.max(
          0,
          outsideCategories.findIndex((category) => category.id === dish.outside_category_id)
        )
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex,
          outsideCategories,
          outsideCategoryNames: outsideCategories.map((category) => category.name),
          outsideCategoryIndex,
          recordType: dish.record_type,
          name: dish.name,
          recommendedText: dish.recommended_items.join("\n"),
          mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({
            ...option,
            selected: dish.meal_periods.includes(option.key)
          })),
          currentImageUrl: dish.image_url,
          canWrite: true
        })
        this.updatePageTitle(dish.record_type)
      } else {
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex: 0,
          outsideCategories,
          outsideCategoryNames: outsideCategories.map((category) => category.name),
          outsideCategoryIndex: 0,
          canWrite: true
        })
      }
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取菜品",
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

  handleRecommendedInput(event: WechatMiniprogram.Input) {
    this.setData({ recommendedText: event.detail.value })
  },

  updatePageTitle(recordType: MenuRecordType) {
    const action = this.data.dishId ? "编辑" : "新增"
    wx.setNavigationBarTitle({
      title: recordType === "outside" ? `${action}外食店铺` : `${action}居家菜品`
    })
  },

  handleRecordTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const recordType = String(event.currentTarget.dataset.type || "") as MenuRecordType
    if (!["home", "outside"].includes(recordType) || recordType === this.data.recordType) return

    const applyType = () => {
      this.setData({ recordType })
      this.updatePageTitle(recordType)
    }

    if (!this.data.dishId) {
      applyType()
      return
    }

    wx.showModal({
      title: "切换记录类型",
      content: recordType === "outside"
        ? "切换为外食后，原来的居家分类将不再使用。"
        : "切换为在家后，原来的推荐菜品将不再使用。",
      confirmText: "继续切换",
      success: (result) => {
        if (result.confirm && isAsyncPageActive(this)) applyType()
      }
    })
  },

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ categoryIndex: Number(event.detail.value) })
  },

  handleOutsideCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ outsideCategoryIndex: Number(event.detail.value) })
  },

  handleMealPeriodTap(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "") as MealPeriod
    const mealOptions = this.data.mealOptions.map((option) =>
      option.key === key ? { ...option, selected: !option.selected } : option
    )
    if (!mealOptions.some((option) => option.selected)) {
      wx.showToast({ title: "请至少保留一个餐次", icon: "none" })
      return
    }
    this.setData({ mealOptions })
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
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const file = result.tempFiles[0]
        if (!file?.tempFilePath) {
          this.setData({ selectingImage: false })
          return
        }

        this.setData({
          selectingImage: false,
          showImageCropper: true,
          cropSourcePath: file.tempFilePath
        })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleImageCropCancel() {
    this.setData({
      showImageCropper: false,
      cropSourcePath: ""
    })
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

  async handleSave() {
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.deleting ||
      this.data.selectingImage
    ) return
    const name = this.data.name.trim()
    const category = this.data.categories[this.data.categoryIndex]
    const outsideCategory = this.data.outsideCategories[this.data.outsideCategoryIndex]
    const recordType = this.data.recordType
    const mealPeriods = this.data.mealOptions
      .filter((option) => option.selected)
      .map((option) => option.key)
    const recommendedItems = this.data.recommendedText
      .split(/[\n，,、]/)
      .map((item) => item.trim())
      .filter(Boolean)
    if (!name) {
      wx.showToast({ title: recordType === "outside" ? "请填写店铺名" : "请填写菜名", icon: "none" })
      return
    }
    if (recordType === "home" && !category) {
      wx.showToast({ title: "请选择分类", icon: "none" })
      return
    }
    if (recordType === "outside" && !outsideCategory) {
      wx.showToast({ title: "请选择外食分类", icon: "none" })
      return
    }
    if (mealPeriods.length === 0) {
      wx.showToast({ title: "请至少选择一个餐次", icon: "none" })
      return
    }
    if (!this.data.dishId && !this.data.selectedImagePath) {
      wx.showToast({ title: "请选择菜品图片", icon: "none" })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.dishId) {
        await updateDish(this.data.dishId, {
          name,
          record_type: recordType,
          category_id: recordType === "home" ? category.id : null,
          outside_category_id: recordType === "outside" ? outsideCategory.id : null,
          meal_periods: mealPeriods,
          recommended_items: recordType === "outside" ? recommendedItems : []
        })
        if (this.data.selectedImagePath) {
          await replaceDishImage(this.data.dishId, this.data.selectedImagePath)
        }
      } else {
        await createDish({
          name,
          recordType,
          categoryId: recordType === "home" ? category.id : undefined,
          outsideCategoryId: recordType === "outside" ? outsideCategory.id : undefined,
          imagePath: this.data.selectedImagePath,
          mealPeriods,
          recommendedItems: recordType === "outside" ? recommendedItems : []
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
    if (!this.data.dishId || this.data.loading || this.data.saving || this.data.deleting) return
    const dishId = this.data.dishId
    this.setData({ deleting: true })
    wx.showModal({
      title: this.data.recordType === "outside" ? "删除店铺" : "删除菜品",
      content: "删除后图片也会从云端移除，无法恢复。",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!isAsyncPageActive(this)) return
        if (!result.confirm) {
          this.setData({ deleting: false })
          return
        }
        wx.showLoading({ title: "删除中", mask: true })
        let deleted = false
        let failureMessage = ""
        try {
          await deleteDish(dishId)
          deleted = true
        } catch (error) {
          failureMessage = error instanceof Error ? error.message : "删除失败"
        } finally {
          wx.hideLoading()
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
        if (!isAsyncPageActive(this)) return
        if (deleted) {
          wx.showToast({ title: "已删除", icon: "success" })
          wx.navigateBack()
        } else {
          wx.showToast({ title: failureMessage, icon: "none" })
        }
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ deleting: false })
      }
    })
  }
})

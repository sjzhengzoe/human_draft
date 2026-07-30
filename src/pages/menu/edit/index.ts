import { ensureLogin } from "../../../services/auth"
import {
  createDish,
  deleteDish,
  getDish,
  listCategories,
  replaceDishImage,
  updateDish
} from "../../../services/menu"
import type { Category, MealPeriod } from "../../../types/api"
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
    name: "",
    mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({ ...option })),
    currentImageUrl: "",
    selectedImagePath: "",
    loading: true,
    saving: false,
    deleting: false,
    canWrite: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const dishId = query.id || ""
    this.setData({ dishId })
    wx.setNavigationBarTitle({ title: dishId ? "编辑菜品" : "新增菜品" })
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

      const categories = await listCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (this.data.dishId) {
        const dish = await getDish(this.data.dishId)
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const categoryIndex = Math.max(
          0,
          categories.findIndex((category) => category.id === dish.category_id)
        )
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex,
          name: dish.name,
          mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({
            ...option,
            selected: dish.meal_periods.includes(option.key)
          })),
          currentImageUrl: dish.image_url,
          canWrite: true
        })
      } else {
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex: 0,
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

  handleCategoryChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ categoryIndex: Number(event.detail.value) })
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
    if (this.data.loading || this.data.saving || this.data.deleting) return
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const file = result.tempFiles[0]
        if (file?.tempFilePath) this.setData({ selectedImagePath: file.tempFilePath })
      }
    })
  },

  async handleSave() {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const name = this.data.name.trim()
    const category = this.data.categories[this.data.categoryIndex]
    const mealPeriods = this.data.mealOptions
      .filter((option) => option.selected)
      .map((option) => option.key)
    if (!name) {
      wx.showToast({ title: "请填写菜名", icon: "none" })
      return
    }
    if (!category) {
      wx.showToast({ title: "请选择分类", icon: "none" })
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
          category_id: category.id,
          meal_periods: mealPeriods
        })
        if (this.data.selectedImagePath) {
          await replaceDishImage(this.data.dishId, this.data.selectedImagePath)
        }
      } else {
        await createDish({
          name,
          categoryId: category.id,
          imagePath: this.data.selectedImagePath,
          mealPeriods
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
      title: "删除菜品",
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

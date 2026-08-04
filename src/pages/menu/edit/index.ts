import { ensureLogin } from "../../../services/auth"
import {
  createDish,
  deleteDish,
  getDish,
  getMenuPlace,
  listCategories,
  listMenuPlaces,
  replaceDishImage,
  updateDish
} from "../../../services/menu"
import type { Category, MealPeriod, MenuRecordType } from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import {
  COOKING_TYPE_OPTIONS,
  normalizeCookingTypes,
  normalizeTasteTags,
  TASTE_OPTIONS
} from "../../../utils/menu-attributes"

type MealPeriodOption = {
  key: MealPeriod
  label: string
  selected: boolean
}

type ChoiceOption = {
  value: string
  selected: boolean
}

const DEFAULT_MEAL_OPTIONS: MealPeriodOption[] = [
  { key: "breakfast", label: "早餐", selected: false },
  { key: "lunch", label: "午餐", selected: true },
  { key: "dinner", label: "晚餐", selected: true }
]

function buildChoiceOptions(defaults: string[], selectedValues: string[]): ChoiceOption[] {
  const selected = new Set(selectedValues.filter(Boolean))
  return [...new Set([...defaults, ...selectedValues].filter(Boolean))].map((value) => ({
    value,
    selected: selected.has(value)
  }))
}

function parseTextItems(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n，,、]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )]
}

Page({
  data: {
    dishId: "",
    placeId: "",
    placeName: "",
    categories: [] as Category[],
    categoryNames: [] as string[],
    categoryIndex: 0,
    recordType: "home" as MenuRecordType,
    name: "",
    mainIngredientsText: "",
    introduction: "",
    cookingMethodOptions: buildChoiceOptions(COOKING_TYPE_OPTIONS, []),
    tasteOptions: buildChoiceOptions(TASTE_OPTIONS, []),
    flavorOptionsText: "",
    mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({ ...option })),
    currentImageUrl: "",
    selectedImagePath: "",
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    showDeleteDialog: false,
    loading: true,
    saving: false,
    deleting: false,
    canWrite: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({
      dishId: query.id || "",
      placeId: query.placeId || ""
    })
    this.updatePageTitle()
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  updatePageTitle() {
    wx.setNavigationBarTitle({ title: `${this.data.dishId ? "编辑" : "新增"}菜品` })
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
        if (!dish.place_id) throw new Error("这条旧记录还没有关联用餐地点")
        const place = await getMenuPlace(dish.place_id)
        if (!isAsyncPageRequestCurrent(this, generation)) return
        const categoryOffset = place.place_type === "outside" ? 1 : 0
        const foundCategoryIndex = categories.findIndex(
          (category) => category.id === dish.category_id
        )
        this.setData({
          categories,
          categoryNames: place.place_type === "outside"
            ? ["暂不分类", ...categories.map((category) => category.name)]
            : categories.map((category) => category.name),
          categoryIndex: foundCategoryIndex >= 0 ? foundCategoryIndex + categoryOffset : 0,
          placeId: place.id,
          placeName: place.name,
          recordType: place.place_type,
          name: dish.name,
          mainIngredientsText: dish.main_ingredients.join("\n"),
          introduction: dish.introduction,
          cookingMethodOptions: buildChoiceOptions(
            COOKING_TYPE_OPTIONS,
            normalizeCookingTypes(dish.cooking_methods)
          ),
          tasteOptions: buildChoiceOptions(
            TASTE_OPTIONS,
            normalizeTasteTags(dish.taste)
          ),
          flavorOptionsText: dish.flavor_options.join("\n"),
          mealOptions: DEFAULT_MEAL_OPTIONS.map((option) => ({
            ...option,
            selected: dish.meal_periods.includes(option.key)
          })),
          currentImageUrl: dish.image_url,
          canWrite: true
        })
      } else {
        const place = this.data.placeId
          ? await getMenuPlace(this.data.placeId)
          : (await listMenuPlaces({ place_type: "home" }))[0]
        if (!place) throw new Error("没有可用的用餐地点")
        const isOutside = place.place_type === "outside"
        this.setData({
          categories,
          categoryNames: isOutside
            ? ["暂不分类", ...categories.map((category) => category.name)]
            : categories.map((category) => category.name),
          categoryIndex: 0,
          placeId: place.id,
          placeName: place.name,
          recordType: place.place_type,
          canWrite: true
        })
      }
      this.updatePageTitle()
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "无法读取菜品",
        icon: "none"
      })
      setTimeout(() => {
        if (isAsyncPageActive(this)) wx.navigateBack()
      }, 900)
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleNameInput(event: WechatMiniprogram.Input) {
    this.setData({ name: event.detail.value })
  },

  handleMainIngredientsInput(event: WechatMiniprogram.Input) {
    this.setData({ mainIngredientsText: event.detail.value })
  },

  handleIntroductionInput(event: WechatMiniprogram.Input) {
    this.setData({ introduction: event.detail.value })
  },

  handleCookingMethodTap(event: WechatMiniprogram.TouchEvent) {
    const value = String(event.currentTarget.dataset.value || "")
    if (!value) return
    this.setData({
      cookingMethodOptions: this.data.cookingMethodOptions.map((option) =>
        option.value === value ? { ...option, selected: !option.selected } : option
      )
    })
  },

  handleTasteTap(event: WechatMiniprogram.TouchEvent) {
    const value = String(event.currentTarget.dataset.value || "")
    if (!value) return
    this.setData({
      tasteOptions: this.data.tasteOptions.map((option) =>
        option.value === value ? { ...option, selected: !option.selected } : option
      )
    })
  },

  handleFlavorOptionsInput(event: WechatMiniprogram.Input) {
    this.setData({ flavorOptionsText: event.detail.value })
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
    if (this.data.loading || this.data.saving || this.data.deleting || this.data.selectingImage) return
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

  async handleSave() {
    if (this.data.loading || this.data.saving || this.data.deleting || this.data.selectingImage) return
    const name = this.data.name.trim()
    const recordType = this.data.recordType
    const categoryOffset = recordType === "outside" ? 1 : 0
    const category = this.data.categoryIndex >= categoryOffset
      ? this.data.categories[this.data.categoryIndex - categoryOffset]
      : undefined
    const mealPeriods = this.data.mealOptions
      .filter((option) => option.selected)
      .map((option) => option.key)
    const mainIngredients = parseTextItems(this.data.mainIngredientsText)
    const introduction = this.data.introduction.trim()
    const cookingMethods = this.data.cookingMethodOptions
      .filter((option) => option.selected)
      .map((option) => option.value)
    const taste = this.data.tasteOptions
      .filter((option) => option.selected)
      .map((option) => option.value)
      .join("、")
    const flavorOptions = parseTextItems(this.data.flavorOptionsText)

    if (!name) {
      wx.showToast({ title: "请填写菜名", icon: "none" })
      return
    }
    if (recordType === "home" && !category) {
      wx.showToast({ title: "请选择分类", icon: "none" })
      return
    }
    if (!this.data.placeId) {
      wx.showToast({ title: "用餐地点无效", icon: "none" })
      return
    }
    if (!this.data.dishId && !this.data.selectedImagePath && recordType === "home") {
      wx.showToast({ title: "请选择菜品图片", icon: "none" })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.dishId) {
        await updateDish(this.data.dishId, {
          name,
          place_id: this.data.placeId,
          category_id: category?.id || null,
          meal_periods: mealPeriods,
          main_ingredients: mainIngredients,
          introduction,
          cooking_methods: cookingMethods,
          taste,
          flavor_options: flavorOptions
        })
        if (this.data.selectedImagePath) {
          await replaceDishImage(this.data.dishId, this.data.selectedImagePath)
        }
      } else {
        await createDish({
          name,
          recordType,
          placeId: this.data.placeId,
          categoryId: category?.id,
          imagePath: this.data.selectedImagePath || undefined,
          mealPeriods,
          mainIngredients,
          introduction,
          cookingMethods,
          taste,
          flavorOptions
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
    this.setData({ showDeleteDialog: true })
  },

  handleDeleteCancel() {
    this.setData({ showDeleteDialog: false })
  },

  async handleDeleteConfirm() {
    if (!this.data.dishId || this.data.deleting) return
    this.setData({ deleting: true, showDeleteDialog: false })
    wx.showLoading({ title: "删除中", mask: true })
    try {
      await deleteDish(this.data.dishId)
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已删除", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ deleting: false })
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      wx.hideLoading()
    }
  }
})

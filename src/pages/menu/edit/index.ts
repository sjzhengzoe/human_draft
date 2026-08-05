import { ensureLogin } from "../../../services/auth"
import { initializeUIFont } from "../../../services/ui-font"
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

Page({
  data: {
    dishId: "",
    placeId: "",
    placeName: "",
    categories: [] as Category[],
    categoryNames: [] as string[],
    categoryIndex: -1,
    recordType: "home" as MenuRecordType,
    name: "",
    mainIngredients: [] as string[],
    mainIngredientInput: "",
    introduction: "",
    cookingMethodOptions: buildChoiceOptions(COOKING_TYPE_OPTIONS, []),
    tasteOptions: buildChoiceOptions(TASTE_OPTIONS, []),
    flavorOptions: [] as string[],
    flavorOptionInput: "",
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
      const [, session] = await Promise.all([
        initializeUIFont().catch(() => undefined),
        ensureLogin()
      ])
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
        const foundCategoryIndex = categories.findIndex(
          (category) => category.id === dish.category_id
        )
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex: foundCategoryIndex,
          placeId: place.id,
          placeName: place.name,
          recordType: place.place_type,
          name: dish.name,
          mainIngredients: dish.main_ingredients,
          introduction: dish.introduction,
          cookingMethodOptions: buildChoiceOptions(
            COOKING_TYPE_OPTIONS,
            normalizeCookingTypes(dish.cooking_methods)
          ),
          tasteOptions: buildChoiceOptions(
            TASTE_OPTIONS,
            normalizeTasteTags(dish.taste)
          ),
          flavorOptions: dish.flavor_options,
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
        this.setData({
          categories,
          categoryNames: categories.map((category) => category.name),
          categoryIndex: -1,
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
    this.setData({ mainIngredientInput: event.detail.value })
  },

  handleAddMainIngredient() {
    const ingredient = this.data.mainIngredientInput.trim()
    if (!ingredient) return
    if (this.data.mainIngredients.includes(ingredient)) {
      wx.showToast({ title: "这个食材已经添加过了", icon: "none" })
      return
    }
    if (this.data.mainIngredients.length >= 30) {
      wx.showToast({ title: "最多添加 30 个主要食材", icon: "none" })
      return
    }
    this.setData({
      mainIngredients: [...this.data.mainIngredients, ingredient],
      mainIngredientInput: ""
    })
  },

  handleRemoveMainIngredient(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.mainIngredients.length) return
    this.setData({
      mainIngredients: this.data.mainIngredients.filter((_, itemIndex) => itemIndex !== index)
    })
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
    this.setData({ flavorOptionInput: event.detail.value })
  },

  handleAddFlavorOption() {
    const flavorOption = this.data.flavorOptionInput.trim()
    if (!flavorOption) return
    if (this.data.flavorOptions.includes(flavorOption)) {
      wx.showToast({ title: "这道衍生菜已经添加过了", icon: "none" })
      return
    }
    if (this.data.flavorOptions.length >= 30) {
      wx.showToast({ title: "最多添加 30 道衍生菜", icon: "none" })
      return
    }
    this.setData({
      flavorOptions: [...this.data.flavorOptions, flavorOption],
      flavorOptionInput: ""
    })
  },

  handleRemoveFlavorOption(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.flavorOptions.length) return
    this.setData({
      flavorOptions: this.data.flavorOptions.filter((_, itemIndex) => itemIndex !== index)
    })
  },

  handleCategoryTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0 || index >= this.data.categoryNames.length) return
    if (index !== this.data.categoryIndex) this.setData({ categoryIndex: index })
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
    const category = this.data.categoryIndex >= 0
      ? this.data.categories[this.data.categoryIndex]
      : undefined
    const mealPeriods = this.data.mealOptions
      .filter((option) => option.selected)
      .map((option) => option.key)
    const pendingMainIngredient = this.data.mainIngredientInput.trim()
    const mainIngredients = pendingMainIngredient
      && !this.data.mainIngredients.includes(pendingMainIngredient)
      ? [...this.data.mainIngredients, pendingMainIngredient]
      : [...this.data.mainIngredients]
    const introduction = this.data.introduction.trim()
    const cookingMethods = this.data.cookingMethodOptions
      .filter((option) => option.selected)
      .map((option) => option.value)
    const taste = this.data.tasteOptions
      .filter((option) => option.selected)
      .map((option) => option.value)
      .join("、")
    const pendingFlavorOption = this.data.flavorOptionInput.trim()
    const flavorOptions = pendingFlavorOption
      && !this.data.flavorOptions.includes(pendingFlavorOption)
      ? [...this.data.flavorOptions, pendingFlavorOption]
      : [...this.data.flavorOptions]

    if (!name) {
      wx.showToast({ title: "请填写菜品名称", icon: "none" })
      return
    }
    if (mainIngredients.length > 30) {
      wx.showToast({ title: "最多添加 30 个主要食材", icon: "none" })
      return
    }
    if (flavorOptions.length > 30) {
      wx.showToast({ title: "最多添加 30 道衍生菜", icon: "none" })
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
          category_id: recordType === "home" ? category?.id || null : null,
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
          categoryId: recordType === "home" ? category?.id : undefined,
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

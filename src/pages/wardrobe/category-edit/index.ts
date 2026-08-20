import {
  createWardrobeCategory,
  deleteWardrobeCategory,
  getWardrobeCategory,
  updateWardrobeCategory
} from "../../../services/wardrobe"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { UI_COLORS } from "../../../styles/colors"
import { createDragSortController, createDragSortData } from "../../../utils/drag-sort"

type EditableField = { key: string; id: string; name: string }

const UPPER_FIELDS = ["肩宽", "胸围", "衣长", "袖长"]
const LOWER_FIELDS = ["腰围", "臀围", "裤长", "腿围", "脚口"]
const fieldDragSort = createDragSortController()
let fieldSequence = 0

function fieldKey(id = "") {
  fieldSequence += 1
  return id || `field_${Date.now()}_${fieldSequence}`
}

Page({
  data: {
    categoryId: "",
    name: "",
    fields: [] as EditableField[],
    loading: false,
    saving: false,
    deleting: false,
    ...createDragSortData()
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const categoryId = query.id || ""
    this.setData({ categoryId })
    wx.setNavigationBarTitle({ title: categoryId ? "编辑分类" : "新增分类" })
    if (categoryId) this.loadCategory()
  },

  onUnload() {
    fieldDragSort.dispose()
    deactivateAsyncPage(this)
  },

  async loadCategory() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const category = await getWardrobeCategory(this.data.categoryId)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        name: category.name,
        fields: category.fields.map((field) => ({ ...field, key: fieldKey(field.id) }))
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取分类",
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

  handleFieldInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.fields[index]) return
    this.setData({ [`fields[${index}].name`]: event.detail.value })
  },

  handleAddField() {
    this.setData({ fields: [...this.data.fields, { key: fieldKey(), id: "", name: "" }] })
  },

  handleRemoveField(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.fields[index]) return
    const fields = this.data.fields.filter((_field, fieldIndex) => fieldIndex !== index)
    this.setData({ fields })
  },

  handleSortDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.deleting) return
    const index = Number(event.currentTarget.dataset.index)
    const field = this.data.fields[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!field || !touch) return
    fieldDragSort.start(this, {
      items: this.data.fields,
      sourceIndex: index,
      keyOf: (item) => item.key,
      touch,
      selector: ".js-field-sort-item",
      title: field.name || "未命名属性",
      meta: "衣物属性"
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    fieldDragSort.move(this, event)
  },

  handleSortDragEnd() {
    const result = fieldDragSort.finish(this, this.data.fields, (item) => item.key)
    if (result) this.setData({ fields: result.items })
  },

  handlePreset(event: WechatMiniprogram.TouchEvent) {
    const preset = String(event.currentTarget.dataset.preset || "")
    const names = preset === "upper" ? UPPER_FIELDS : LOWER_FIELDS
    const existingNames = new Set(
      this.data.fields.map((field) => field.name.trim()).filter(Boolean)
    )
    const fields = [...this.data.fields]
    names.forEach((name) => {
      if (!existingNames.has(name)) fields.push({ key: fieldKey(), id: "", name })
    })
    this.setData({ fields })
  },

  handleClearFields() {
    if (!this.data.fields.length) return
    wx.showModal({
      title: "清空属性",
      content: "已保存衣物中的旧属性值会保留，但不会继续显示。",
      confirmText: "清空",
      confirmColor: UI_COLORS.danger,
      success: (result) => {
        if (result.confirm && isAsyncPageActive(this)) this.setData({ fields: [] })
      }
    })
  },

  async handleSave() {
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const name = this.data.name.trim()
    const fields = this.data.fields.map((field) => ({
      id: field.id,
      name: field.name.trim()
    }))
    if (!name) {
      wx.showToast({ title: "请填写分类名称", icon: "none" })
      return
    }
    if (fields.some((field) => !field.name)) {
      wx.showToast({ title: "请填写完整的属性名称", icon: "none" })
      return
    }
    const normalizedNames = fields.map((field) => field.name.toLocaleLowerCase())
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      wx.showToast({ title: "属性名称不能重复", icon: "none" })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      if (this.data.categoryId) {
        await updateWardrobeCategory(this.data.categoryId, { name, fields })
      } else {
        await createWardrobeCategory({
          name,
          fields: fields.map((field) => ({ name: field.name }))
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
    if (!this.data.categoryId || this.data.loading || this.data.saving || this.data.deleting) return
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除分类",
      content: "只有分类下没有衣物时才能删除。删除后，属性预设无法恢复。",
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
          await deleteWardrobeCategory(this.data.categoryId)
          if (!isAsyncPageActive(this)) return
          wx.showToast({ title: "已删除", icon: "success" })
          wx.navigateBack({ delta: 2 })
        } catch (error) {
          if (isAsyncPageActive(this)) {
            wx.showToast({
              title: error instanceof Error ? error.message : "删除失败",
              icon: "none",
              duration: 2600
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

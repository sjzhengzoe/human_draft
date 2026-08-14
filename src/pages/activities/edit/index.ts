import { ensureLogin } from "../../../services/auth"
import {
  createActivityItem,
  listActivityItems,
  replaceActivityItemImage,
  updateActivityItem
} from "../../../services/activities"
import type { ActivityType } from "../../../types/activities"
import type { ImageCrop, ImageCropResult } from "../../../types/images"
import {
  activateAsyncPage,
  deactivateAsyncPage,
  isAsyncPageActive
} from "../../../utils/async-page"

const ACTIVITY_TYPES: ActivityType[] = ["室内", "户外", "居家"]

function activityType(value: string | undefined): ActivityType {
  return ACTIVITY_TYPES.includes(value as ActivityType) ? value as ActivityType : "室内"
}

Page({
  data: {
    activityTypes: ACTIVITY_TYPES,
    loading: true,
    editingId: "",
    editorName: "",
    editorIntroduction: "",
    editorType: "室内" as ActivityType,
    currentImageUrl: "",
    selectedImagePath: "",
    selectedImageUploadPath: "",
    selectedImageCrop: null as ImageCrop | null,
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const editingId = String(query.id || "")
    const editorType = activityType(query.type)
    this.setData({ editingId, editorType })
    void this.loadEditor(editingId)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadEditor(editingId: string) {
    try {
      const session = await ensureLogin()
      if (!session.user.can_write) throw new Error("当前账号没有编辑权限")
      if (!editingId) {
        if (isAsyncPageActive(this)) this.setData({ loading: false })
        return
      }
      const items = await listActivityItems()
      const item = items.find((entry) => entry.id === editingId)
      if (!item) throw new Error("活动不存在或已删除")
      if (!isAsyncPageActive(this)) return
      this.setData({
        editorName: item.name,
        editorIntroduction: item.introduction || "",
        editorType: item.activity_type,
        currentImageUrl: item.image_url || "",
        loading: false
      })
    } catch (error) {
      if (!isAsyncPageActive(this)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "读取失败",
        icon: "none"
      })
      wx.navigateBack()
    }
  },

  handleBack() {
    if (this.data.saving || this.data.selectingImage || this.data.showImageCropper) return
    wx.navigateBack()
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

  handleChooseImage() {
    if (this.data.saving || this.data.selectingImage || this.data.showImageCropper) return
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

  handleImageCropConfirm(event: WechatMiniprogram.CustomEvent<ImageCropResult>) {
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

  handleImageCropError(event: WechatMiniprogram.CustomEvent<{ message?: string }>) {
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
      if (this.data.editingId) {
        const item = await updateActivityItem(this.data.editingId, {
          name,
          introduction,
          activityType: this.data.editorType
        })
        if (this.data.selectedImageUploadPath) {
          await replaceActivityItemImage(
            item.id,
            this.data.selectedImageUploadPath,
            this.data.selectedImageCrop
          )
        }
      } else {
        await createActivityItem({
          name,
          introduction,
          activityType: this.data.editorType,
          imagePath: this.data.selectedImageUploadPath || undefined,
          imageCrop: this.data.selectedImageCrop
        })
      }
      if (!isAsyncPageActive(this)) return
      this.getOpenerEventChannel().emit("saved", { type: this.data.editorType })
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
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  }
})

import {
  createKeyMoment,
  deleteKeyMomentImage,
  listKeyMoments,
  replaceKeyMomentImage,
  updateKeyMoment
} from "../../../services/key-moments"
import { ensureLogin } from "../../../services/auth"
import type { ImageCrop, ImageCropResult } from "../../../types/images"
import {
  activateAsyncPage,
  deactivateAsyncPage,
  isAsyncPageActive
} from "../../../utils/async-page"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function currentShanghaiDateTime(): { date: string; time: string } {
  const now = new Date(Date.now() + SHANGHAI_OFFSET_MS)
  return {
    date: `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`,
    time: `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`
  }
}

function editorDateTime(value: string): { date: string; time: string } {
  const date = new Date(new Date(value).getTime() + SHANGHAI_OFFSET_MS)
  return {
    date: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    time: `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  }
}

const INITIAL_DATE_TIME = currentShanghaiDateTime()

Page({
  data: {
    loading: true,
    editingId: "",
    editorContent: "",
    editorDate: INITIAL_DATE_TIME.date,
    editorTime: INITIAL_DATE_TIME.time,
    currentImageUrl: "",
    originalImageUrl: "",
    selectedImagePath: "",
    selectedImageUploadPath: "",
    selectedImageCrop: null as ImageCrop | null,
    removeCurrentImage: false,
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const editingId = String(query.id || "")
    const editorDate = String(query.date || INITIAL_DATE_TIME.date)
    const editorTime = String(query.time || INITIAL_DATE_TIME.time)
    this.setData({ editingId, editorDate, editorTime })
    void this.loadEditor(editingId, editorDate)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadEditor(editingId: string, editorDate: string) {
    try {
      const session = await ensureLogin()
      if (!session.user.can_write) throw new Error("当前账号没有编辑权限")
      if (!editingId) {
        if (isAsyncPageActive(this)) this.setData({ loading: false })
        return
      }
      let items = await listKeyMoments({ granularity: "day", date: editorDate })
      let item = items.find((entry) => entry.id === editingId)
      if (!item) {
        items = await listKeyMoments(
          { granularity: "day", date: editorDate },
          { forceRefresh: true }
        )
        item = items.find((entry) => entry.id === editingId)
      }
      if (!item) throw new Error("关键节点不存在或已删除")
      if (!isAsyncPageActive(this)) return
      const dateTime = editorDateTime(item.occurred_at)
      this.setData({
        editorContent: item.content,
        editorDate: dateTime.date,
        editorTime: dateTime.time,
        currentImageUrl: item.image_url,
        originalImageUrl: item.image_url,
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

  handleContentInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ editorContent: event.detail.value })
  },

  handleEditorDateChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editorDate: String(event.detail.value) })
  },

  handleEditorTimeChange(event: WechatMiniprogram.PickerChange) {
    this.setData({ editorTime: String(event.detail.value) })
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
        const file = result.tempFiles[0]
        if (file?.tempFilePath) {
          this.setData({
            selectingImage: false,
            showImageCropper: true,
            cropSourcePath: file.tempFilePath
          })
          return
        }
        this.setData({ selectingImage: false })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleImageCropCancel() {
    if (this.data.saving) return
    this.setData({ showImageCropper: false, cropSourcePath: "" })
  },

  handleImageCropConfirm(event: WechatMiniprogram.CustomEvent<ImageCropResult>) {
    const { tempFilePath, sourceFilePath, crop } = event.detail
    if (!tempFilePath || !sourceFilePath) return
    this.setData({
      selectedImagePath: tempFilePath,
      selectedImageUploadPath: sourceFilePath,
      selectedImageCrop: crop || null,
      currentImageUrl: this.data.originalImageUrl,
      removeCurrentImage: false,
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

  handleRemoveEditorImage() {
    if (this.data.saving) return
    if (this.data.selectedImagePath) {
      this.setData({
        selectedImagePath: "",
        selectedImageUploadPath: "",
        selectedImageCrop: null
      })
      return
    }
    if (this.data.currentImageUrl) {
      this.setData({ currentImageUrl: "", removeCurrentImage: true })
    }
  },

  async saveEditor() {
    if (this.data.saving || this.data.selectingImage) return
    const content = this.data.editorContent.trim()
    const hasImage = Boolean(this.data.selectedImagePath || this.data.currentImageUrl)
    if (!content && !hasImage) {
      wx.showToast({ title: "请填写文案或上传图片", icon: "none" })
      return
    }
    const occurredAt = `${this.data.editorDate}T${this.data.editorTime}:00+08:00`
    this.setData({ saving: true })
    try {
      if (this.data.editingId) {
        await updateKeyMoment(this.data.editingId, { content, occurredAt })
        if (this.data.selectedImageUploadPath) {
          await replaceKeyMomentImage(
            this.data.editingId,
            this.data.selectedImageUploadPath,
            this.data.selectedImageCrop
          )
        } else if (this.data.removeCurrentImage) {
          await deleteKeyMomentImage(this.data.editingId)
        }
      } else {
        await createKeyMoment({
          content,
          occurredAt,
          imagePath: this.data.selectedImageUploadPath || undefined,
          imageCrop: this.data.selectedImageCrop
        })
      }
      if (!isAsyncPageActive(this)) return
      this.getOpenerEventChannel().emit("saved", { date: this.data.editorDate })
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
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
  }
})

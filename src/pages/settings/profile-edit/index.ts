import { getCurrentUser } from "../../../services/auth"
import { updateAccountAvatar, updateAccountProfile } from "../../../services/profile"
import type { ImageCrop, ImageCropResult } from "../../../types/images"

function profileInitial(value: string): string {
  return value.trim().slice(0, 1) || "E"
}

Page({
  data: {
    originalDisplayName: "",
    editingDisplayName: "",
    editingAvatarUrl: "",
    editingAvatarInitial: "E",
    pendingAvatarPath: "",
    pendingAvatarUploadPath: "",
    pendingAvatarCrop: null as ImageCrop | null,
    selectingProfileAvatar: false,
    showImageCropper: false,
    cropSourcePath: "",
    savingProfile: false
  },

  onLoad() {
    const user = getCurrentUser()
    if (!user) {
      wx.showToast({ title: "请先登录", icon: "none" })
      wx.navigateBack()
      return
    }
    this.setData({
      originalDisplayName: user.display_name,
      editingDisplayName: user.display_name,
      editingAvatarUrl: user.avatar_url,
      editingAvatarInitial: profileInitial(user.display_name)
    })
  },

  handleBack() {
    if (this.data.savingProfile || this.data.selectingProfileAvatar || this.data.showImageCropper) return
    wx.navigateBack()
  },

  handleDisplayNameInput(event: WechatMiniprogram.Input) {
    const editingDisplayName = event.detail.value
    this.setData({
      editingDisplayName,
      editingAvatarInitial: profileInitial(editingDisplayName)
    })
  },

  handleChooseProfileAvatar() {
    if (
      this.data.savingProfile ||
      this.data.selectingProfileAvatar ||
      this.data.showImageCropper
    ) return
    this.setData({ selectingProfileAvatar: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["original"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const path = result.tempFiles[0]?.tempFilePath
        if (!path) {
          this.setData({ selectingProfileAvatar: false })
          return
        }
        this.setData({
          selectingProfileAvatar: false,
          showImageCropper: true,
          cropSourcePath: path
        })
      },
      fail: () => this.setData({ selectingProfileAvatar: false })
    })
  },

  handleAvatarCropCancel() {
    this.setData({ showImageCropper: false, cropSourcePath: "" })
  },

  handleAvatarCropConfirm(event: WechatMiniprogram.CustomEvent<ImageCropResult>) {
    const { tempFilePath, sourceFilePath, crop } = event.detail
    if (!tempFilePath || !sourceFilePath) return
    this.setData({
      editingAvatarUrl: tempFilePath,
      pendingAvatarPath: tempFilePath,
      pendingAvatarUploadPath: sourceFilePath,
      pendingAvatarCrop: crop || null,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleAvatarCropError(event: WechatMiniprogram.CustomEvent<{ message?: string }>) {
    wx.showToast({
      title: event.detail.message || "头像裁剪失败，请重试",
      icon: "none"
    })
  },

  async handleProfileSave() {
    if (this.data.savingProfile) return
    const displayName = this.data.editingDisplayName.trim()
    if (!displayName) {
      wx.showToast({ title: "请填写昵称", icon: "none" })
      return
    }
    if (Array.from(displayName).length > 40) {
      wx.showToast({ title: "昵称不能超过 40 个字符", icon: "none" })
      return
    }
    const displayNameChanged = displayName !== this.data.originalDisplayName
    if (!displayNameChanged && !this.data.pendingAvatarPath) {
      wx.navigateBack()
      return
    }
    this.setData({ savingProfile: true })
    try {
      if (displayNameChanged) await updateAccountProfile(displayName)
      if (this.data.pendingAvatarPath) {
        await updateAccountAvatar(
          this.data.pendingAvatarUploadPath,
          this.data.pendingAvatarCrop
        )
      }
      wx.showToast({ title: "个人资料已更新", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : "保存失败，请重试",
        icon: "none",
        duration: 3000
      })
    } finally {
      this.setData({ savingProfile: false })
    }
  }
})

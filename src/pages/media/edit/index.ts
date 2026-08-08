import { ensureLogin } from "../../../services/auth"
import {
  createMediaEntry,
  listMediaCategories,
  replaceMediaEntryCover
} from "../../../services/media"
import type { MediaStatus, MediaType } from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { markMediaDataChanged } from "../../../utils/media-data-revision"

const BUILTIN_PLATFORMS = [
  "腾讯视频",
  "爱奇艺",
  "哔哩哔哩",
  "夸克",
  "优酷",
  "芒果 TV",
  "猫耳",
  "漫播",
  "Books"
]
const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"]
const ERROR_TOAST_DURATION = 3000

function showErrorToast(title: string) {
  wx.showToast({ title, icon: "none", duration: ERROR_TOAST_DURATION })
}

Page({
  data: {
    title: "",
    selectedImagePath: "",
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    mediaTypes: [] as MediaType[],
    mediaTypeIndex: 0,
    watchStatus: "completed" as MediaStatus,
    isEpisodic: false,
    isAudio: false,
    isRevisitable: false,
    platformOptions: BUILTIN_PLATFORMS.map((name) => ({ name, checked: false })),
    selectedBuiltinPlatforms: [] as string[],
    loading: true,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    void this.loadPage(query)
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadPage(query: Record<string, string | undefined>) {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const session = await ensureLogin()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!session.user.can_write) {
        showErrorToast("当前账号只有查看权限")
        wx.navigateBack()
        return
      }

      const categories = await listMediaCategories()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const mediaTypes = categories.map((category) => category.name)
      if (!mediaTypes.length) {
        wx.showModal({
          title: "请先创建分类",
          content: "影视记录还没有可用分类。",
          showCancel: false,
          success: () => isAsyncPageActive(this) && wx.navigateBack()
        })
        return
      }
      const queryType = decodeURIComponent(query.mediaType || mediaTypes[0]) as MediaType
      const mediaTypeIndex = Math.max(0, mediaTypes.indexOf(queryType))
      const mediaType = mediaTypes[mediaTypeIndex]
      this.setData({
        mediaTypes,
        mediaTypeIndex,
        isEpisodic: EPISODIC_MEDIA_TYPES.includes(mediaType),
        isAudio: mediaType === "广播剧"
      })
      wx.setNavigationBarTitle({ title: "新增影视" })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showModal({
        title: "加载失败",
        content: error instanceof Error ? error.message : "无法读取影视条目",
        showCancel: false,
        success: () => {
          if (isAsyncPageActive(this)) wx.navigateBack()
        }
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ title: event.detail.value })
  },

  handleChooseImage() {
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.selectingImage ||
      this.data.showImageCropper
    ) return
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
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
    event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>
  ) {
    const path = event.detail.tempFilePath
    if (!path) return
    this.setData({
      selectedImagePath: path,
      showImageCropper: false,
      cropSourcePath: ""
    })
  },

  handleImageCropError(
    event: WechatMiniprogram.CustomEvent<{ message?: string }>
  ) {
    showErrorToast(event.detail.message || "图片裁剪失败，请重试")
  },

  handleTypeChange(event: WechatMiniprogram.PickerChange) {
    const mediaTypeIndex = Number(event.detail.value)
    const mediaType = this.data.mediaTypes[mediaTypeIndex]
    this.setData({
      mediaTypeIndex,
      isEpisodic: EPISODIC_MEDIA_TYPES.includes(mediaType),
      isAudio: mediaType === "广播剧"
    })
  },

  handleStatusTap(event: WechatMiniprogram.TouchEvent) {
    this.setData({ watchStatus: event.currentTarget.dataset.status as MediaStatus })
  },

  handlePlatformsChange(event: WechatMiniprogram.CheckboxGroupChange) {
    const selectedBuiltinPlatforms = event.detail.value
      .filter((name) => BUILTIN_PLATFORMS.includes(name))
    this.setData({
      selectedBuiltinPlatforms,
      platformOptions: BUILTIN_PLATFORMS.map((name) => ({
        name,
        checked: selectedBuiltinPlatforms.includes(name)
      }))
    })
  },

  handleRevisitableChange(event: WechatMiniprogram.SwitchChange) {
    this.setData({ isRevisitable: event.detail.value })
  },

  async handleSave() {
    if (
      this.data.loading ||
      this.data.saving ||
      this.data.selectingImage ||
      this.data.showImageCropper
    ) return
    const title = this.data.title.trim()
    const mediaType = this.data.mediaTypes[this.data.mediaTypeIndex]
    if (!title || !mediaType) {
      showErrorToast("请填写名称和分类")
      return
    }
    const selectedPlatforms = [...new Set(this.data.selectedBuiltinPlatforms)]
      .filter((name) => BUILTIN_PLATFORMS.includes(name))
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中" })
    const input = {
      title,
      media_type: mediaType,
      watch_status: this.data.watchStatus,
      platforms: selectedPlatforms,
      is_revisitable: this.data.isRevisitable
    }
    let entryCreated = false
    try {
      const savedEntry = await createMediaEntry(input)
      const id = savedEntry.id
      entryCreated = true
      if (this.data.selectedImagePath) {
        await replaceMediaEntryCover(id, this.data.selectedImagePath)
      }
      markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已新增", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (entryCreated) markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        const message = error instanceof Error ? error.message : "保存失败"
        showErrorToast(
          entryCreated && this.data.selectedImagePath
            ? `作品已新增，封面上传失败：${message}`
            : message
        )
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  }
})

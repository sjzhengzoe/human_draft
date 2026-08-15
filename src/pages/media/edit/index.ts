import { ensureLogin } from "../../../services/auth"
import {
  createMediaEntry,
  listMediaCategories,
  replaceMediaEntryCover
} from "../../../services/media"
import type { MediaStatus, MediaType } from "../../../types/media"
import type { ImageCrop, ImageCropResult } from "../../../types/images"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { markMediaDataChanged } from "../../../utils/media-data-revision"
import { UI_COLORS } from "../../../styles/colors"

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
const MEDIA_CREATE_DRAFT_KEY = "media:create:draft:v1"

type MediaCreateDraft = {
  title: string
  mediaType: string
  watchStatus: MediaStatus
  personalRating: number
  platforms: string[]
}

function showErrorToast(title: string) {
  wx.showToast({ title, icon: "none", duration: ERROR_TOAST_DURATION })
}

Page({
  data: {
    title: "",
    selectedImagePath: "",
    selectedImageUploadPath: "",
    selectedImageCrop: null as ImageCrop | null,
    selectingImage: false,
    showImageCropper: false,
    cropSourcePath: "",
    mediaTypes: [] as MediaType[],
    mediaTypeIndex: 0,
    watchStatus: "completed" as MediaStatus,
    personalRating: 3,
    ratingOptions: [1, 2, 3, 4, 5],
    isEpisodic: false,
    isAudio: false,
    platformOptions: BUILTIN_PLATFORMS.map((name) => ({ name, checked: false })),
    selectedBuiltinPlatforms: [] as string[],
    loading: true,
    saving: false,
    draftDirty: false,
    themeColors: UI_COLORS
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
      const savedDraft = this.readDraft()
      const draftType = savedDraft && mediaTypes.includes(savedDraft.mediaType)
        ? savedDraft.mediaType
        : queryType
      const mediaTypeIndex = Math.max(0, mediaTypes.indexOf(draftType))
      const mediaType = mediaTypes[mediaTypeIndex]
      const selectedBuiltinPlatforms = (savedDraft?.platforms || [])
        .filter((name) => BUILTIN_PLATFORMS.includes(name))
      this.setData({
        title: savedDraft?.title || "",
        mediaTypes,
        mediaTypeIndex,
        watchStatus: savedDraft?.watchStatus || "completed",
        personalRating: savedDraft?.personalRating || 3,
        selectedBuiltinPlatforms,
        platformOptions: BUILTIN_PLATFORMS.map((name) => ({
          name,
          checked: selectedBuiltinPlatforms.includes(name)
        })),
        isEpisodic: EPISODIC_MEDIA_TYPES.includes(mediaType),
        isAudio: mediaType === "广播剧",
        draftDirty: Boolean(savedDraft)
      })
      if (savedDraft) {
        this.enableDraftGuard()
        wx.showToast({ title: "已恢复未完成内容", icon: "none" })
      }
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

  readDraft(): MediaCreateDraft | null {
    try {
      const value = wx.getStorageSync(MEDIA_CREATE_DRAFT_KEY) as Partial<MediaCreateDraft> | undefined
      if (!value || typeof value.title !== "string") return null
      return {
        title: value.title,
        mediaType: String(value.mediaType || ""),
        watchStatus: (["planned", "in_progress", "completed"] as unknown[]).includes(value.watchStatus)
          ? value.watchStatus as MediaStatus
          : "completed",
        personalRating: Number.isInteger(value.personalRating)
          ? Math.min(5, Math.max(1, Number(value.personalRating)))
          : 3,
        platforms: Array.isArray(value.platforms) ? value.platforms.map(String) : []
      }
    } catch (_error) {
      return null
    }
  },

  persistDraft() {
    const mediaType = this.data.mediaTypes[this.data.mediaTypeIndex] || ""
    const draft: MediaCreateDraft = {
      title: this.data.title,
      mediaType,
      watchStatus: this.data.watchStatus,
      personalRating: this.data.personalRating,
      platforms: [...this.data.selectedBuiltinPlatforms]
    }
    try {
      wx.setStorageSync(MEDIA_CREATE_DRAFT_KEY, draft)
    } catch (_error) {
      // 本地空间不足时不影响正常新增。
    }
  },

  enableDraftGuard() {
    if (!this.data.draftDirty) this.setData({ draftDirty: true })
    wx.enableAlertBeforeUnload({ message: "新增内容还没有保存，确定离开吗？" })
  },

  markDraftDirty() {
    this.enableDraftGuard()
    this.persistDraft()
  },

  clearDraft() {
    try {
      wx.removeStorageSync(MEDIA_CREATE_DRAFT_KEY)
    } catch (_error) {
      // 忽略本地草稿清理失败。
    }
    wx.disableAlertBeforeUnload()
    this.setData({ draftDirty: false })
  },

  handleTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ title: event.detail.value }, () => this.markDraftDirty())
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
    }, () => this.enableDraftGuard())
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
    }, () => this.markDraftDirty())
  },

  handleStatusTap(event: WechatMiniprogram.TouchEvent) {
    this.setData({ watchStatus: event.currentTarget.dataset.status as MediaStatus }, () => this.markDraftDirty())
  },

  handlePersonalRatingTap(event: WechatMiniprogram.TouchEvent) {
    const personalRating = Number(event.currentTarget.dataset.rating)
    if (!Number.isInteger(personalRating) || personalRating < 1 || personalRating > 5) return
    if (personalRating === this.data.personalRating) return
    this.setData({ personalRating }, () => this.markDraftDirty())
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
    }, () => this.markDraftDirty())
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
    if (
      this.data.watchStatus === "completed"
      && (!Number.isInteger(this.data.personalRating)
        || this.data.personalRating < 1
        || this.data.personalRating > 5)
    ) {
      showErrorToast("请选择 1 到 5 星评分")
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
      personal_rating: this.data.watchStatus === "completed"
        ? this.data.personalRating
        : undefined,
      platforms: selectedPlatforms
    }
    let entryCreated = false
    let toast: { title: string; icon: "success" | "none" } | null = null
    try {
      const savedEntry = await createMediaEntry(input)
      const id = savedEntry.id
      entryCreated = true
      if (this.data.selectedImageUploadPath) {
        await replaceMediaEntryCover(
          id,
          this.data.selectedImageUploadPath,
          this.data.selectedImageCrop
        )
      }
      markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        this.clearDraft()
        toast = { title: "已新增", icon: "success" }
      }
    } catch (error) {
      if (entryCreated) markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        const message = error instanceof Error ? error.message : "保存失败"
        toast = {
          title: entryCreated && this.data.selectedImagePath
            ? `作品已新增，封面上传失败：${message}`
            : message,
          icon: "none"
        }
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
    if (!toast || !isAsyncPageActive(this)) return
    wx.showToast({
      ...toast,
      duration: toast.icon === "none" ? ERROR_TOAST_DURATION : undefined
    })
    if (toast.icon === "success") wx.navigateBack()
  }
})

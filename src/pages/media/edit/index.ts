import { ensureLogin } from "../../../services/auth"
import {
  createMediaEntry,
  deleteMediaEntry,
  getMediaEntry,
  listMediaCategories,
  updateMediaEntry
} from "../../../services/media"
import type { MediaEntry, MediaStatus, MediaType } from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { markMediaDataChanged } from "../../../utils/media-data-revision"

const BUILTIN_PLATFORMS = [
  "待定",
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
    id: "",
    title: "",
    mediaTypes: [] as MediaType[],
    mediaTypeIndex: 0,
    watchStatus: "completed" as MediaStatus,
    isEpisodic: false,
    isAudio: false,
    isRevisitable: false,
    platformOptions: BUILTIN_PLATFORMS.map((name) => ({ name, checked: false })),
    selectedBuiltinPlatforms: [] as string[],
    loading: true,
    saving: false,
    deleting: false
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
      this.setData({ mediaTypes })

      const id = String(query.id || "")
      if (!id) {
        const queryType = decodeURIComponent(query.mediaType || mediaTypes[0]) as MediaType
        const mediaTypeIndex = Math.max(0, mediaTypes.indexOf(queryType))
        const mediaType = mediaTypes[mediaTypeIndex]
        this.setData({
          mediaTypeIndex,
          isEpisodic: EPISODIC_MEDIA_TYPES.includes(mediaType),
          isAudio: mediaType === "广播剧"
        })
        wx.setNavigationBarTitle({ title: "新增影视" })
        return
      }

      wx.setNavigationBarTitle({ title: "编辑影视" })
      const stored = wx.getStorageSync("MEDIA_EDIT_ITEM") as MediaEntry | undefined
      if (stored?.id === id) this.applyEntry(stored)
      const entry = await getMediaEntry(id)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyEntry(entry)
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

  applyEntry(entry: MediaEntry) {
    this.setData({
      id: entry.id,
      title: entry.title,
      mediaTypeIndex: Math.max(0, this.data.mediaTypes.indexOf(entry.media_type)),
      watchStatus: entry.watch_status,
      isEpisodic: EPISODIC_MEDIA_TYPES.includes(entry.media_type),
      isAudio: entry.media_type === "广播剧",
      isRevisitable: Boolean(entry.is_revisitable),
      platformOptions: BUILTIN_PLATFORMS.map((name) => ({
        name,
        checked: entry.platforms.includes(name)
      })),
      selectedBuiltinPlatforms: entry.platforms.filter((name) => BUILTIN_PLATFORMS.includes(name))
    })
  },

  handleTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ title: event.detail.value })
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
    const values = event.detail.value
    const selectedPending = values.includes("待定")
    const previouslyPending = this.data.selectedBuiltinPlatforms.includes("待定")
    const selectedBuiltinPlatforms = selectedPending && !previouslyPending
      ? ["待定"]
      : values.filter((name) => name !== "待定")
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
    if (this.data.loading || this.data.saving || this.data.deleting) return
    const title = this.data.title.trim()
    const mediaType = this.data.mediaTypes[this.data.mediaTypeIndex]
    if (!title || !mediaType) {
      showErrorToast("请填写名称和分类")
      return
    }
    const selectedPlatforms = this.data.selectedBuiltinPlatforms.includes("待定")
      ? ["待定"]
      : [...new Set(this.data.selectedBuiltinPlatforms)].filter((name) => BUILTIN_PLATFORMS.includes(name))
    if (selectedPlatforms.length === 0) {
      showErrorToast("请选择平台/来源")
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: "保存中" })
    const input = {
      title,
      media_type: mediaType,
      watch_status: this.data.watchStatus,
      platforms: selectedPlatforms,
      is_revisitable: this.data.isRevisitable
    }
    try {
      if (this.data.id) await updateMediaEntry(this.data.id, input)
      else await createMediaEntry(input)
      markMediaDataChanged()
      wx.removeStorageSync("MEDIA_EDIT_ITEM")
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        showErrorToast(error instanceof Error ? error.message : "保存失败")
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDelete() {
    if (!this.data.id || this.data.loading || this.data.saving || this.data.deleting) return
    const id = this.data.id
    this.setData({ deleting: true })
    wx.showModal({
      title: "删除影视条目",
      content: "删除后无法恢复。",
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
          await deleteMediaEntry(id)
          markMediaDataChanged()
          wx.removeStorageSync("MEDIA_EDIT_ITEM")
          deleted = true
        } catch (error) {
          failureMessage = error instanceof Error ? error.message : "删除失败"
        } finally {
          wx.hideLoading()
          if (isAsyncPageActive(this)) this.setData({ deleting: false })
        }
        if (!isAsyncPageActive(this)) return
        if (deleted) wx.navigateBack()
        else showErrorToast(failureMessage)
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ deleting: false })
      }
    })
  }
})

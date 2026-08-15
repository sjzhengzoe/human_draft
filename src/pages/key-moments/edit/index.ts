import {
  appendKeyMomentImage,
  createKeyMoment,
  deleteKeyMomentImage,
  listKeyMoments,
  updateKeyMoment
} from "../../../services/key-moments"
import { ensureLogin } from "../../../services/auth"
import {
  activateAsyncPage,
  deactivateAsyncPage,
  isAsyncPageActive
} from "../../../utils/async-page"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_IMAGE_COUNT = 9

type EditorImage = {
  key: string
  previewUrl: string
  selectedImageUploadPath: string
  persistedIndex: number | null
}

let editorImageSequence = 0

function localEditorImage(path: string): EditorImage {
  editorImageSequence += 1
  return {
    key: `local_${Date.now()}_${editorImageSequence}`,
    previewUrl: path,
    selectedImageUploadPath: path,
    persistedIndex: null
  }
}

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

function editorDateTimeLabel(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return `${year}年${month}月${day}日 ${time}`
}

const INITIAL_DATE_TIME = currentShanghaiDateTime()

Page({
  data: {
    loading: true,
    editingId: "",
    editorContent: "",
    editorDate: INITIAL_DATE_TIME.date,
    editorTime: INITIAL_DATE_TIME.time,
    editorDateTimeLabel: editorDateTimeLabel(INITIAL_DATE_TIME.date, INITIAL_DATE_TIME.time),
    editorImages: [] as EditorImage[],
    removedPersistedIndexes: [] as number[],
    canAddImage: true,
    selectingImage: false,
    saving: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const editingId = String(query.id || "")
    const editorDate = String(query.date || INITIAL_DATE_TIME.date)
    const editorTime = String(query.time || INITIAL_DATE_TIME.time)
    this.setData({
      editingId,
      editorDate,
      editorTime,
      editorDateTimeLabel: editorDateTimeLabel(editorDate, editorTime)
    })
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
        editorDateTimeLabel: editorDateTimeLabel(dateTime.date, dateTime.time),
        editorImages: item.image_urls.map((previewUrl, persistedIndex) => ({
          key: `persisted_${persistedIndex}`,
          previewUrl,
          selectedImageUploadPath: "",
          persistedIndex
        })),
        canAddImage: item.image_urls.length < MAX_IMAGE_COUNT,
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
    if (this.data.saving || this.data.selectingImage) return
    wx.navigateBack()
  },

  handleEditorContentInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ editorContent: event.detail.value })
  },

  handleChooseImage() {
    if (this.data.saving || this.data.selectingImage) return
    const remaining = MAX_IMAGE_COUNT - this.data.editorImages.length
    if (remaining <= 0) {
      wx.showToast({ title: "最多上传 9 张图片", icon: "none" })
      return
    }
    this.setData({ selectingImage: true })
    wx.chooseMedia({
      count: remaining,
      mediaType: ["image"],
      sizeType: ["original"],
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const addedImages = result.tempFiles
          .map((file) => file.tempFilePath)
          .filter(Boolean)
          .map((sourceFilePath) => localEditorImage(sourceFilePath))
        const editorImages = [...this.data.editorImages, ...addedImages].slice(0, MAX_IMAGE_COUNT)
        this.setData({
          editorImages,
          canAddImage: editorImages.length < MAX_IMAGE_COUNT,
          selectingImage: false
        })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleRemoveEditorImage(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    const image = this.data.editorImages[index]
    if (!image) return
    const editorImages = this.data.editorImages.filter((_item, currentIndex) => currentIndex !== index)
    const removedPersistedIndexes = image.persistedIndex === null
      ? this.data.removedPersistedIndexes
      : [...this.data.removedPersistedIndexes, image.persistedIndex]
    this.setData({ editorImages, removedPersistedIndexes, canAddImage: true })
  },

  handlePreviewEditorImage(event: WechatMiniprogram.TouchEvent) {
    const current = String(event.currentTarget.dataset.url || "")
    const urls = this.data.editorImages.map((image) => image.previewUrl)
    if (current && urls.length) wx.previewImage({ current, urls })
  },

  async saveEditor() {
    if (this.data.saving || this.data.selectingImage) return
    const content = this.data.editorContent.trim()
    const hasImage = this.data.editorImages.length > 0
    if (!content && !hasImage) {
      wx.showToast({ title: "请填写文案或上传图片", icon: "none" })
      return
    }
    const occurredAt = `${this.data.editorDate}T${this.data.editorTime}:00+08:00`
    this.setData({ saving: true })
    try {
      if (this.data.editingId) {
        await updateKeyMoment(this.data.editingId, { content })
        const removedIndexes = [...this.data.removedPersistedIndexes].sort((left, right) => right - left)
        const pendingImages = this.data.editorImages.filter((item) => item.selectedImageUploadPath)
        const retainedImageCount = this.data.editorImages.length - pendingImages.length
        if (!content && retainedImageCount === 0 && pendingImages.length) {
          if (removedIndexes.length >= MAX_IMAGE_COUNT) {
            const lastOriginalIndex = removedIndexes.pop()
            for (const index of removedIndexes) {
              await deleteKeyMomentImage(this.data.editingId, index)
            }
            await appendKeyMomentImage(this.data.editingId, pendingImages.shift()!.selectedImageUploadPath)
            if (lastOriginalIndex !== undefined) {
              await deleteKeyMomentImage(this.data.editingId, 0)
            }
          } else {
            await appendKeyMomentImage(this.data.editingId, pendingImages.shift()!.selectedImageUploadPath)
            for (const index of removedIndexes) {
              await deleteKeyMomentImage(this.data.editingId, index)
            }
          }
        } else {
          for (const index of removedIndexes) {
            await deleteKeyMomentImage(this.data.editingId, index)
          }
        }
        for (const image of pendingImages) {
          await appendKeyMomentImage(this.data.editingId, image.selectedImageUploadPath)
        }
      } else {
        const pendingImages = this.data.editorImages.filter((image) => image.selectedImageUploadPath)
        const firstImage = pendingImages.shift()
        const created = await createKeyMoment({
          content,
          occurredAt,
          imagePath: firstImage?.selectedImageUploadPath
        })
        for (const image of pendingImages) {
          await appendKeyMomentImage(created.id, image.selectedImageUploadPath)
        }
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

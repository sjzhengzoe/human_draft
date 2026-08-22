import {
  createKeyMoment,
  createKeyMomentDraft,
  discardNewKeyMomentImages,
  discardStagedKeyMomentImages,
  readKeyMoment,
  stageNewKeyMomentImage,
  stageKeyMomentImage,
  updateKeyMoment
} from "../services/key-moments"
import { ensureLogin } from "../../../services/auth"
import {
  activateAsyncPage,
  deactivateAsyncPage,
  isAsyncPageActive
} from "../../../utils/async-page"

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const MAX_IMAGE_COUNT = 9
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024
const MAX_CONTENT_LENGTH = 2_000

type EditorImage = {
  key: string
  previewUrl: string
  selectedImageUploadPath: string
  sourceBytes: number
  persistedPath: string
  stagedPath: string
}

type DragRect = {
  left: number
  top: number
  width: number
  height: number
}

type ActiveImageDrag = {
  key: string
  touchOffsetX: number
  touchOffsetY: number
  itemRects: DragRect[]
}

let editorImageSequence = 0
let imageDragSequence = 0
let activeImageDrag: ActiveImageDrag | null = null
let suppressPreviewUntil = 0
let saveEditorInFlight = false

function localEditorImage(path: string, sourceBytes: number): EditorImage {
  editorImageSequence += 1
  return {
    key: `local_${Date.now()}_${editorImageSequence}`,
    previewUrl: path,
    selectedImageUploadPath: path,
    sourceBytes,
    persistedPath: "",
    stagedPath: ""
  }
}

function oversizedImagePositions(images: EditorImage[]): number[] {
  return images
    .map((image, index) => image.sourceBytes > MAX_IMAGE_UPLOAD_BYTES ? index + 1 : 0)
    .filter((position) => position > 0)
}

function showOversizedImageWarning(positions: number[]) {
  if (!positions.length) return
  wx.showToast({
    title: `第 ${positions.join("、")} 张照片超过 10 MB，请压缩或删除`,
    icon: "none",
    duration: 3500
  })
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
    maxContentLength: MAX_CONTENT_LENGTH,
    editorDate: INITIAL_DATE_TIME.date,
    editorTime: INITIAL_DATE_TIME.time,
    editorDateTimeLabel: editorDateTimeLabel(INITIAL_DATE_TIME.date, INITIAL_DATE_TIME.time),
    editorImages: [] as EditorImage[],
    originalImagePaths: [] as string[],
    canAddImage: true,
    selectingImage: false,
    draggingImageKey: "",
    dragGhostUrl: "",
    dragGhostStyle: "",
    saving: false,
    initialContent: "",
    initialImagePaths: [] as string[],
    newDraftId: "",
    saved: false,
    showDiscardConfirm: false,
    discarding: false
  },

  onLoad(query: Record<string, string | undefined>) {
    activeImageDrag = null
    imageDragSequence += 1
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
    void this.loadEditor(editingId)
  },

  onUnload() {
    if (!this.data.saved && this.data.newDraftId) {
      const stagedPaths = this.data.editorImages.map((image) => image.stagedPath).filter(Boolean)
      if (stagedPaths.length) {
        void discardNewKeyMomentImages(this.data.newDraftId, stagedPaths).catch(() => undefined)
      }
    }
    activeImageDrag = null
    imageDragSequence += 1
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
      const item = await readKeyMoment(editingId)
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
          sourceBytes: 0,
          persistedPath: item.image_paths[persistedIndex] || "",
          stagedPath: ""
        })),
        originalImagePaths: [...item.image_paths],
        initialContent: item.content,
        initialImagePaths: [...item.image_paths],
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
    if (this.data.saving || this.data.selectingImage || this.data.discarding) return
    if (!this.hasUnsavedChanges()) {
      wx.navigateBack()
      return
    }
    this.setData({ showDiscardConfirm: true })
  },

  hasUnsavedChanges(): boolean {
    if (this.data.editorContent !== this.data.initialContent) return true
    const currentImages = this.data.editorImages.map(
      (image) => image.persistedPath || image.selectedImageUploadPath
    )
    return JSON.stringify(currentImages) !== JSON.stringify(this.data.initialImagePaths)
  },

  handleDiscardCancel() {
    if (!this.data.discarding) this.setData({ showDiscardConfirm: false })
  },

  async handleDiscardConfirm() {
    if (this.data.discarding) return
    this.setData({ discarding: true })
    const draftId = this.data.newDraftId
    const stagedPaths = this.data.editorImages.map((image) => image.stagedPath).filter(Boolean)
    if (draftId && stagedPaths.length) {
      try {
        await discardNewKeyMomentImages(draftId, stagedPaths)
      } catch (_error) {
        // 服务端会在暂存图片过期后再次核对并清理未引用对象。
      }
    }
    if (!isAsyncPageActive(this)) return
    this.setData({ newDraftId: "", saved: true, showDiscardConfirm: false })
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
          .filter((file) => Boolean(file.tempFilePath))
          .map((file) => localEditorImage(file.tempFilePath, Number(file.size) || 0))
        const editorImages = [...this.data.editorImages, ...addedImages].slice(0, MAX_IMAGE_COUNT)
        this.setData({
          editorImages,
          canAddImage: editorImages.length < MAX_IMAGE_COUNT,
          selectingImage: false
        })
        showOversizedImageWarning(oversizedImagePositions(editorImages))
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingImage: false })
      }
    })
  },

  handleRemoveEditorImage(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.draggingImageKey) return
    const index = Number(event.currentTarget.dataset.index)
    const image = this.data.editorImages[index]
    if (!image) return
    const editorImages = this.data.editorImages.filter((_item, currentIndex) => currentIndex !== index)
    this.setData({ editorImages, canAddImage: true })
    if (this.data.newDraftId && image.stagedPath) {
      void discardNewKeyMomentImages(this.data.newDraftId, [image.stagedPath]).catch(() => undefined)
    }
  },

  handlePreviewEditorImage(event: WechatMiniprogram.TouchEvent) {
    if (this.data.draggingImageKey || Date.now() < suppressPreviewUntil) return
    const current = String(event.currentTarget.dataset.url || "")
    const urls = this.data.editorImages.map((image) => image.previewUrl)
    if (current && urls.length) wx.previewImage({ current, urls })
  },

  handleImageLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.selectingImage || this.data.editorImages.length < 2) return
    const index = Number(event.currentTarget.dataset.index)
    const image = this.data.editorImages[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!image || !touch) return
    const sequence = ++imageDragSequence
    wx.createSelectorQuery()
      .in(this)
      .selectAll(".image-grid__item")
      .boundingClientRect()
      .exec((results) => {
        if (sequence !== imageDragSequence || !isAsyncPageActive(this)) return
        const itemRects = (results[0] || []) as DragRect[]
        const rect = itemRects[index]
        if (!rect) return
        activeImageDrag = {
          key: image.key,
          touchOffsetX: touch.clientX - rect.left,
          touchOffsetY: touch.clientY - rect.top,
          itemRects
        }
        suppressPreviewUntil = Date.now() + 600
        this.setData({
          draggingImageKey: image.key,
          dragGhostUrl: image.previewUrl,
          dragGhostStyle: imageDragStyle(
            touch.clientX - activeImageDrag.touchOffsetX,
            touch.clientY - activeImageDrag.touchOffsetY,
            rect
          )
        })
        wx.vibrateShort({ type: "light" })
      })
  },

  handleImageTouchMove(event: WechatMiniprogram.TouchEvent) {
    const drag = activeImageDrag
    const touch = event.touches[0] || event.changedTouches[0]
    if (!drag || !touch) return
    const currentIndex = this.data.editorImages.findIndex((image) => image.key === drag.key)
    if (currentIndex < 0) return
    const targetIndex = closestImageIndex(touch.clientX, touch.clientY, drag.itemRects)
    const changes: Record<string, unknown> = {
      dragGhostStyle: imageDragStyle(
        touch.clientX - drag.touchOffsetX,
        touch.clientY - drag.touchOffsetY,
        drag.itemRects[currentIndex]
      )
    }
    if (targetIndex >= 0 && targetIndex !== currentIndex) {
      const editorImages = [...this.data.editorImages]
      const [draggedImage] = editorImages.splice(currentIndex, 1)
      editorImages.splice(targetIndex, 0, draggedImage)
      changes.editorImages = editorImages
    }
    this.setData(changes)
  },

  handleImageTouchEnd() {
    imageDragSequence += 1
    activeImageDrag = null
    if (!this.data.draggingImageKey) return
    suppressPreviewUntil = Date.now() + 400
    this.setData({
      draggingImageKey: "",
      dragGhostUrl: "",
      dragGhostStyle: ""
    })
  },

  async saveNewKeyMoment(content: string, occurredAt: string) {
    let draftId = this.data.newDraftId
    if (!draftId) {
      draftId = await createKeyMomentDraft()
      if (!isAsyncPageActive(this)) return
      this.setData({ newDraftId: draftId })
    }

    const pendingIndexes = this.data.editorImages
      .map((image, index) => image.selectedImageUploadPath && !image.stagedPath ? index : -1)
      .filter((index) => index >= 0)
    await mapWithConcurrency(pendingIndexes, 2, async (index) => {
      const image = this.data.editorImages[index]
      if (!image) return
      const stagedPath = await stageNewKeyMomentImage(draftId, image.selectedImageUploadPath)
      image.stagedPath = stagedPath
      if (isAsyncPageActive(this)) {
        this.setData({ [`editorImages[${index}].stagedPath`]: stagedPath })
      }
    })
    const imagePaths = this.data.editorImages.map((image) => image.stagedPath).filter(Boolean)
    try {
      await createKeyMoment({ id: draftId, content, occurredAt, imagePaths })
    } catch (createError) {
      try {
        await readKeyMoment(draftId)
        await updateKeyMoment(draftId, { content, imagePaths })
      } catch (_lookupError) {
        throw createError
      }
    }
  },

  async saveEditor() {
    if (saveEditorInFlight || this.data.saving || this.data.selectingImage) return
    const content = this.data.editorContent.trim()
    const hasImage = this.data.editorImages.length > 0
    if (!content && !hasImage) {
      wx.showToast({ title: "请填写文案或上传图片", icon: "none" })
      return
    }
    const oversizedPositions = oversizedImagePositions(this.data.editorImages)
    if (oversizedPositions.length) {
      showOversizedImageWarning(oversizedPositions)
      return
    }
    const occurredAt = `${this.data.editorDate}T${this.data.editorTime}:00+08:00`
    const stagedImagePaths: string[] = []
    saveEditorInFlight = true
    try {
      this.setData({ saving: true })
      if (this.data.editingId) {
        const pendingImages = this.data.editorImages.filter((item) => item.selectedImageUploadPath)
        const retainedImagePaths = new Set(
          this.data.editorImages.map((image) => image.persistedPath).filter(Boolean)
        )
        const replacedImagePaths = this.data.originalImagePaths.filter(
          (path) => !retainedImagePaths.has(path)
        )
        const stagedPathByImageKey = new Map<string, string>()
        const stagedPairs = await mapWithConcurrency(pendingImages, 2, async (image) => {
          const stagedPath = await stageKeyMomentImage(
            this.data.editingId,
            image.selectedImageUploadPath,
            replacedImagePaths
          )
          stagedImagePaths.push(stagedPath)
          return { key: image.key, stagedPath }
        })
        stagedPairs.forEach(({ key, stagedPath }) => {
          stagedPathByImageKey.set(key, stagedPath)
        })
        const imagePaths = this.data.editorImages.map(
          (image) => image.persistedPath || stagedPathByImageKey.get(image.key) || ""
        )
        await updateKeyMoment(this.data.editingId, { content, imagePaths })
        stagedImagePaths.length = 0
      } else {
        await this.saveNewKeyMoment(content, occurredAt)
      }
      if (!isAsyncPageActive(this)) return
      this.setData({ saved: true })
      this.getOpenerEventChannel().emit("saved", { date: this.data.editorDate })
      wx.showToast({ title: "已保存", icon: "success" })
      wx.navigateBack()
    } catch (error) {
      if (this.data.editingId && stagedImagePaths.length) {
        try {
          await discardStagedKeyMomentImages(this.data.editingId, stagedImagePaths)
        } catch (_cleanupError) {
          // 提交请求可能已经成功，服务端会拒绝清理已写入节点的图片。
        }
      }
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none"
        })
      }
    } finally {
      saveEditorInFlight = false
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  }
})

function imageDragStyle(left: number, top: number, rect: DragRect): string {
  return `left: ${left}px; top: ${top}px; width: ${rect.width}px; height: ${rect.height}px;`
}

function closestImageIndex(clientX: number, clientY: number, rects: DragRect[]): number {
  let closestIndex = -1
  let closestDistance = Number.POSITIVE_INFINITY
  rects.forEach((rect, index) => {
    const distanceX = clientX - (rect.left + rect.width / 2)
    const distanceY = clientY - (rect.top + rect.height / 2)
    const distance = distanceX * distanceX + distanceY * distanceY
    if (distance < closestDistance) {
      closestDistance = distance
      closestIndex = index
    }
  })
  return closestIndex
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  action: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  let firstError: unknown
  const worker = async () => {
    while (nextIndex < items.length && !firstError) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = await action(items[index], index)
      } catch (error) {
        firstError = error
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  )
  if (firstError) throw firstError
  return results
}

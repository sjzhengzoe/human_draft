type CropShape = "circle" | "square" | "rectangle"
type CropHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

type CanvasImage = {
  src: string
  onload: (() => void) | null
  onerror: ((error: unknown) => void) | null
}

type CanvasNode = {
  width: number
  height: number
  getContext: (contextId: "2d") => CanvasContext
  createImage: () => CanvasImage
}

type CanvasContext = {
  clearRect: (x: number, y: number, width: number, height: number) => void
  drawImage(
    image: unknown,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number
  ): void
}

type CropFrame = {
  left: number
  top: number
  width: number
  height: number
}

type CropState = {
  naturalWidth: number
  naturalHeight: number
  imageLeft: number
  imageTop: number
  imageWidth: number
  imageHeight: number
  cropLeft: number
  cropTop: number
  cropWidth: number
  cropHeight: number
  fixedAspectRatio: number
}

type CropGesture = {
  mode: "move" | "resize"
  handle?: CropHandle
  startClientX: number
  startClientY: number
  startFrame: CropFrame
}

type TouchPoint = {
  clientX: number
  clientY: number
}

type ImageInfo = {
  width: number
  height: number
}

type WorkspaceBounds = {
  width?: number
  height?: number
}

const CANVAS_ID = "imageCropperCanvas"
const WORKSPACE_INSET_RPX = 24
const MIN_CROP_PX = 56
const cropStates = new WeakMap<object, CropState>()
const cropGestures = new WeakMap<object, CropGesture>()

Component({
  properties: {
    src: {
      type: String,
      value: ""
    },
    shape: {
      type: String,
      value: "rectangle"
    },
    title: {
      type: String,
      value: "裁剪图片"
    },
    outputSize: {
      type: Number,
      value: 1080
    },
    outputType: {
      type: String,
      value: "png"
    },
    outputQuality: {
      type: Number,
      value: 0.86
    },
    aspectRatio: {
      type: Number,
      value: 0
    }
  },

  data: {
    ready: false,
    processing: false,
    statusBarHeight: wx.getSystemInfoSync().statusBarHeight || 0,
    displaySrc: "",
    imageLeft: 0,
    imageTop: 0,
    imageWidth: 0,
    imageHeight: 0,
    cropLeft: 0,
    cropTop: 0,
    cropWidth: 0,
    cropHeight: 0,
    fixedAspectRatio: 0
  },

  lifetimes: {
    ready() {
      void this.initializeCrop()
    },
    detached() {
      cropStates.delete(this)
      cropGestures.delete(this)
    }
  },

  methods: {
    async initializeCrop(): Promise<void> {
      const src = this.properties.src
      if (!src) {
        this.triggerEvent("error", { message: "未选择图片" })
        return
      }

      this.setData({ displaySrc: src, ready: false })
      try {
        const [workspace, imageInfo] = await Promise.all([
          this.measureWorkspace(),
          this.getImageInfo(src)
        ])
        const windowWidth = wx.getSystemInfoSync().windowWidth
        const inset = (windowWidth * WORKSPACE_INSET_RPX) / 750
        const availableWidth = Math.max(workspace.width - inset * 2, 1)
        const availableHeight = Math.max(workspace.height - inset * 2, 1)
        const displayScale = Math.min(
          availableWidth / imageInfo.width,
          availableHeight / imageInfo.height
        )
        const imageWidth = imageInfo.width * displayScale
        const imageHeight = imageInfo.height * displayScale
        const imageLeft = (workspace.width - imageWidth) / 2
        const imageTop = (workspace.height - imageHeight) / 2
        const fixedAspectRatio = resolveFixedAspectRatio(
          this.properties.shape as CropShape,
          Number(this.properties.aspectRatio)
        )
        const initialFrame = initialCropFrame({
          imageLeft,
          imageTop,
          imageWidth,
          imageHeight,
          fixedAspectRatio
        })
        const state: CropState = {
          naturalWidth: imageInfo.width,
          naturalHeight: imageInfo.height,
          imageLeft,
          imageTop,
          imageWidth,
          imageHeight,
          cropLeft: initialFrame.left,
          cropTop: initialFrame.top,
          cropWidth: initialFrame.width,
          cropHeight: initialFrame.height,
          fixedAspectRatio
        }

        cropStates.set(this, state)
        cropGestures.delete(this)
        this.syncState(state, true)
      } catch (error) {
        console.error("初始化图片裁剪失败", error)
        this.triggerEvent("error", { message: "无法读取图片，请重试" })
      }
    },

    measureWorkspace(): Promise<{ width: number; height: number }> {
      return new Promise((resolve) => {
        this.createSelectorQuery()
          .select(".crop-workspace")
          .boundingClientRect((result) => {
            const bounds = result as WorkspaceBounds | null
            if (bounds?.width && bounds.height) {
              resolve({ width: bounds.width, height: bounds.height })
              return
            }
            const systemInfo = wx.getSystemInfoSync()
            resolve({
              width: systemInfo.windowWidth,
              height: Math.max(systemInfo.windowHeight - 180, 240)
            })
          })
          .exec()
      })
    },

    getImageInfo(src: string): Promise<ImageInfo> {
      return new Promise((resolve, reject) => {
        wx.getImageInfo({
          src,
          success: (result) => resolve({ width: result.width, height: result.height }),
          fail: reject
        })
      })
    },

    noop() {},

    handleFrameTouchStart(event: WechatMiniprogram.TouchEvent) {
      const touch = event.touches[0]
      const state = cropStates.get(this)
      if (!touch || !state || this.data.processing) return
      cropGestures.set(this, {
        mode: "move",
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startFrame: frameFromState(state)
      })
    },

    handleResizeTouchStart(event: WechatMiniprogram.TouchEvent) {
      const touch = event.touches[0]
      const state = cropStates.get(this)
      const handle = String(event.currentTarget.dataset.handle || "") as CropHandle
      if (!touch || !state || !isCropHandle(handle) || this.data.processing) return
      cropGestures.set(this, {
        mode: "resize",
        handle,
        startClientX: touch.clientX,
        startClientY: touch.clientY,
        startFrame: frameFromState(state)
      })
    },

    handleGestureMove(event: WechatMiniprogram.TouchEvent) {
      const touch = event.touches[0]
      const state = cropStates.get(this)
      const gesture = cropGestures.get(this)
      if (!touch || !state || !gesture || this.data.processing) return

      const deltaX = touch.clientX - gesture.startClientX
      const deltaY = touch.clientY - gesture.startClientY
      if (gesture.mode === "move") {
        moveCropFrame(state, gesture.startFrame, deltaX, deltaY)
      } else if (gesture.handle) {
        resizeCropFrame(state, gesture.startFrame, gesture.handle, deltaX, deltaY)
      }
      this.syncState(state)
    },

    handleGestureEnd() {
      cropGestures.delete(this)
    },

    syncState(state: CropState, ready = false) {
      this.setData({
        ready: ready || this.data.ready,
        imageLeft: state.imageLeft,
        imageTop: state.imageTop,
        imageWidth: state.imageWidth,
        imageHeight: state.imageHeight,
        cropLeft: state.cropLeft,
        cropTop: state.cropTop,
        cropWidth: state.cropWidth,
        cropHeight: state.cropHeight,
        fixedAspectRatio: state.fixedAspectRatio
      })
    },

    handleCancel() {
      if (this.data.processing) return
      this.triggerEvent("cancel")
    },

    async handleConfirm() {
      const state = cropStates.get(this)
      if (!state || this.data.processing || !this.data.ready) return

      const cropped = isCropped(state)
      let resultPath = ""
      let errorMessage = ""
      this.setData({ processing: true })
      wx.showLoading({ title: "保存中", mask: true })
      try {
        const canvas = await this.getCanvas()
        const image = await loadCanvasImage(canvas, this.data.displaySrc || this.properties.src)
        const imageScaleX = state.naturalWidth / state.imageWidth
        const imageScaleY = state.naturalHeight / state.imageHeight
        const sourceX = clamp(
          (state.cropLeft - state.imageLeft) * imageScaleX,
          0,
          state.naturalWidth
        )
        const sourceY = clamp(
          (state.cropTop - state.imageTop) * imageScaleY,
          0,
          state.naturalHeight
        )
        const sourceWidth = Math.min(state.cropWidth * imageScaleX, state.naturalWidth - sourceX)
        const sourceHeight = Math.min(state.cropHeight * imageScaleY, state.naturalHeight - sourceY)
        const maximumOutputWidth = Math.max(Number(this.properties.outputSize) || 1080, 320)
        const outputScale = Math.min(maximumOutputWidth / sourceWidth, 1)
        const outputWidth = Math.max(Math.round(sourceWidth * outputScale), 1)
        const outputHeight = Math.max(Math.round(sourceHeight * outputScale), 1)

        canvas.width = outputWidth
        canvas.height = outputHeight
        const ctx = canvas.getContext("2d")
        ctx.clearRect(0, 0, outputWidth, outputHeight)
        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          outputWidth,
          outputHeight
        )

        resultPath = await canvasToTempFilePath(
          canvas,
          outputWidth,
          outputHeight,
          normalizedOutputType(this.properties.outputType),
          normalizedOutputQuality(this.properties.outputQuality)
        )
      } catch (error) {
        console.error("保存裁剪图片失败", error)
        errorMessage = cropExportErrorMessage(error)
      } finally {
        wx.hideLoading()
        this.setData({ processing: false })
      }
      if (errorMessage) {
        this.triggerEvent("error", { message: errorMessage })
        return
      }
      this.triggerEvent("confirm", {
        tempFilePath: resultPath,
        cropped
      })
    },

    getCanvas(): Promise<CanvasNode> {
      return new Promise((resolve, reject) => {
        this.createSelectorQuery()
          .select(`#${CANVAS_ID}`)
          .node((result) => {
            if (result?.node) {
              resolve(result.node as CanvasNode)
              return
            }
            reject(new Error("未找到裁剪 canvas"))
          })
          .exec()
      })
    }
  }
})

function resolveFixedAspectRatio(shape: CropShape, aspectRatio: number) {
  if (shape === "circle" || shape === "square") return 1
  return Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 0
}

function initialCropFrame(input: {
  imageLeft: number
  imageTop: number
  imageWidth: number
  imageHeight: number
  fixedAspectRatio: number
}): CropFrame {
  if (!input.fixedAspectRatio) {
    return {
      left: input.imageLeft,
      top: input.imageTop,
      width: input.imageWidth,
      height: input.imageHeight
    }
  }

  const imageAspectRatio = input.imageWidth / input.imageHeight
  const width = imageAspectRatio > input.fixedAspectRatio
    ? input.imageHeight * input.fixedAspectRatio
    : input.imageWidth
  const height = width / input.fixedAspectRatio
  return {
    left: input.imageLeft + (input.imageWidth - width) / 2,
    top: input.imageTop + (input.imageHeight - height) / 2,
    width,
    height
  }
}

function frameFromState(state: CropState): CropFrame {
  return {
    left: state.cropLeft,
    top: state.cropTop,
    width: state.cropWidth,
    height: state.cropHeight
  }
}

function moveCropFrame(
  state: CropState,
  start: CropFrame,
  deltaX: number,
  deltaY: number
) {
  state.cropLeft = clamp(
    start.left + deltaX,
    state.imageLeft,
    state.imageLeft + state.imageWidth - start.width
  )
  state.cropTop = clamp(
    start.top + deltaY,
    state.imageTop,
    state.imageTop + state.imageHeight - start.height
  )
}

function resizeCropFrame(
  state: CropState,
  start: CropFrame,
  handle: CropHandle,
  deltaX: number,
  deltaY: number
) {
  if (state.fixedAspectRatio) {
    resizeFixedCropFrame(state, start, handle, deltaX, deltaY)
    return
  }
  resizeFreeCropFrame(state, start, handle, deltaX, deltaY)
}

function resizeFreeCropFrame(
  state: CropState,
  start: CropFrame,
  handle: CropHandle,
  deltaX: number,
  deltaY: number
) {
  const imageRight = state.imageLeft + state.imageWidth
  const imageBottom = state.imageTop + state.imageHeight
  const minimumWidth = Math.min(MIN_CROP_PX, state.imageWidth)
  const minimumHeight = Math.min(MIN_CROP_PX, state.imageHeight)
  let left = start.left
  let top = start.top
  let right = start.left + start.width
  let bottom = start.top + start.height

  if (handle.includes("w")) {
    left = clamp(start.left + deltaX, state.imageLeft, right - minimumWidth)
  }
  if (handle.includes("e")) {
    right = clamp(start.left + start.width + deltaX, left + minimumWidth, imageRight)
  }
  if (handle.includes("n")) {
    top = clamp(start.top + deltaY, state.imageTop, bottom - minimumHeight)
  }
  if (handle.includes("s")) {
    bottom = clamp(start.top + start.height + deltaY, top + minimumHeight, imageBottom)
  }

  state.cropLeft = left
  state.cropTop = top
  state.cropWidth = right - left
  state.cropHeight = bottom - top
}

function resizeFixedCropFrame(
  state: CropState,
  start: CropFrame,
  handle: CropHandle,
  deltaX: number,
  deltaY: number
) {
  if (!isCornerHandle(handle)) return
  const east = handle.includes("e")
  const south = handle.includes("s")
  const anchorX = east ? start.left : start.left + start.width
  const anchorY = south ? start.top : start.top + start.height
  const pointerX = (east ? start.left + start.width : start.left) + deltaX
  const pointerY = (south ? start.top + start.height : start.top) + deltaY
  const candidateWidth = Math.abs(pointerX - anchorX)
  const candidateHeight = Math.abs(pointerY - anchorY)
  const widthDelta = Math.abs(candidateWidth - start.width) / Math.max(start.width, 1)
  const heightDelta = Math.abs(candidateHeight - start.height) / Math.max(start.height, 1)
  const horizontalLimit = east
    ? state.imageLeft + state.imageWidth - anchorX
    : anchorX - state.imageLeft
  const verticalLimit = south
    ? state.imageTop + state.imageHeight - anchorY
    : anchorY - state.imageTop
  const maximumWidth = Math.min(horizontalLimit, verticalLimit * state.fixedAspectRatio)
  const desiredWidth = heightDelta > widthDelta
    ? candidateHeight * state.fixedAspectRatio
    : candidateWidth
  const minimumWidth = Math.min(
    maximumWidth,
    Math.max(
      Math.min(MIN_CROP_PX, state.imageWidth),
      Math.min(MIN_CROP_PX, state.imageHeight) * state.fixedAspectRatio
    )
  )
  const width = clamp(desiredWidth, minimumWidth, maximumWidth)
  const height = width / state.fixedAspectRatio

  state.cropLeft = east ? anchorX : anchorX - width
  state.cropTop = south ? anchorY : anchorY - height
  state.cropWidth = width
  state.cropHeight = height
}

function isCropHandle(value: string): value is CropHandle {
  return ["nw", "n", "ne", "e", "se", "s", "sw", "w"].includes(value)
}

function isCornerHandle(handle: CropHandle) {
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw"
}

function isCropped(state: CropState) {
  const tolerance = 0.5
  return Math.abs(state.cropLeft - state.imageLeft) > tolerance
    || Math.abs(state.cropTop - state.imageTop) > tolerance
    || Math.abs(state.cropWidth - state.imageWidth) > tolerance
    || Math.abs(state.cropHeight - state.imageHeight) > tolerance
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return maximum
  return Math.min(maximum, Math.max(minimum, value))
}

function loadCanvasImage(canvas: CanvasNode, src: string) {
  return new Promise<CanvasImage>((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function canvasToTempFilePath(
  canvas: CanvasNode,
  width: number,
  height: number,
  fileType: "jpg" | "png",
  quality: number
) {
  return new Promise<string>((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType,
      quality,
      success: (result) => resolve(result.tempFilePath),
      fail: reject
    })
  })
}

function normalizedOutputType(value: string): "jpg" | "png" {
  return value === "png" ? "png" : "jpg"
}

function normalizedOutputQuality(value: number): number {
  return Number.isFinite(value) ? clamp(value, 0.5, 1) : 0.86
}

function cropExportErrorMessage(error: unknown): string {
  const message = typeof error === "object" && error && "errMsg" in error
    ? String((error as { errMsg?: unknown }).errMsg || "")
    : error instanceof Error
      ? error.message
      : String(error || "")
  return /too\s*large|file\s*large|文件.{0,4}大/i.test(message)
    ? "图片文件过大，请缩小裁剪范围后重试"
    : "图片保存失败，请重试"
}

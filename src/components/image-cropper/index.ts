type CropShape = "circle" | "square" | "rectangle"

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
  drawImage: (
    image: unknown,
    sourceX: number,
    sourceY: number,
    sourceWidth: number,
    sourceHeight: number,
    destinationX: number,
    destinationY: number,
    destinationWidth: number,
    destinationHeight: number
  ) => void
}

type CropState = {
  naturalWidth: number
  naturalHeight: number
  viewportWidth: number
  viewportHeight: number
  minScale: number
  scale: number
  offsetX: number
  offsetY: number
}

type CropGesture =
  | {
      mode: "move"
      startClientX: number
      startClientY: number
      startOffsetX: number
      startOffsetY: number
    }
  | {
      mode: "scale"
      startDistance: number
      startScale: number
      startOffsetX: number
      startOffsetY: number
    }

type TouchPoint = {
  clientX: number
  clientY: number
}

const STAGE_RPX = 536
const VIEWPORT_WIDTH_RPX = 420
const CANVAS_ID = "imageCropperCanvas"
// Keep a small rendered-image buffer around the crop frame. A boundary that is
// mathematically exact can still expose the stage background after sub-pixel
// rounding on high-density screens.
const EDGE_GUARD_PX = 2
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
      value: "square"
    },
    title: {
      type: String,
      value: "裁剪图片"
    },
    outputSize: {
      type: Number,
      value: 1080
    },
    aspectRatio: {
      type: Number,
      value: 1
    }
  },

  data: {
    ready: false,
    processing: false,
    displayWidth: 0,
    displayHeight: 0,
    offsetX: 0,
    offsetY: 0,
    frameLeft: 0,
    frameTop: 0,
    frameWidth: 0,
    frameHeight: 0
  },

  lifetimes: {
    ready() {
      this.initializeCrop()
    },
    detached() {
      cropStates.delete(this)
      cropGestures.delete(this)
    }
  },

  methods: {
    initializeCrop() {
      const src = this.properties.src
      if (!src) {
        this.triggerEvent("error", { message: "未选择图片" })
        return
      }

      wx.getImageInfo({
        src,
        success: (imageInfo) => {
          const windowWidth = wx.getSystemInfoSync().windowWidth
          const aspectRatio = Math.max(Number(this.properties.aspectRatio) || 1, 0.5)
          const viewportWidth = (windowWidth * VIEWPORT_WIDTH_RPX) / 750
          const viewportHeight = viewportWidth / aspectRatio
          const stageSize = (windowWidth * STAGE_RPX) / 750
          const frameLeft = (stageSize - viewportWidth) / 2
          const frameTop = (stageSize - viewportHeight) / 2
          const minScale = Math.max(
            (viewportWidth + EDGE_GUARD_PX * 2) / imageInfo.width,
            (viewportHeight + EDGE_GUARD_PX * 2) / imageInfo.height
          )
          const displayWidth = imageInfo.width * minScale
          const displayHeight = imageInfo.height * minScale
          const state: CropState = {
            naturalWidth: imageInfo.width,
            naturalHeight: imageInfo.height,
            viewportWidth,
            viewportHeight,
            minScale,
            scale: minScale,
            offsetX: (viewportWidth - displayWidth) / 2,
            offsetY: (viewportHeight - displayHeight) / 2
          }

          cropStates.set(this, state)
          this.setData({
            frameLeft,
            frameTop,
            frameWidth: viewportWidth,
            frameHeight: viewportHeight
          })
          this.syncTransform(state, true)
        },
        fail: () => {
          this.triggerEvent("error", { message: "无法读取图片，请重试" })
        }
      })
    },

    noop() {},

    handleTouchStart(event: WechatMiniprogram.TouchEvent) {
      this.beginGesture(event.touches)
    },

    handleTouchMove(event: WechatMiniprogram.TouchEvent) {
      const state = cropStates.get(this)
      const gesture = cropGestures.get(this)
      if (!state || !gesture || !event.touches.length) return

      if (gesture.mode === "move" && event.touches.length === 1) {
        const touch = event.touches[0]
        applyTransform(
          state,
          state.scale,
          gesture.startOffsetX + touch.clientX - gesture.startClientX,
          gesture.startOffsetY + touch.clientY - gesture.startClientY
        )
        this.syncTransform(state)
        return
      }

      if (gesture.mode === "scale" && event.touches.length >= 2) {
        const distance = getTouchDistance(event.touches[0], event.touches[1])
        const requestedScale = gesture.startScale * (distance / gesture.startDistance)
        const nextScale = clampScale(state, requestedScale)
        const ratio = nextScale / gesture.startScale
        const anchorX = state.viewportWidth / 2
        const anchorY = state.viewportHeight / 2

        applyTransform(
          state,
          nextScale,
          anchorX - (anchorX - gesture.startOffsetX) * ratio,
          anchorY - (anchorY - gesture.startOffsetY) * ratio
        )
        this.syncTransform(state)
      }
    },

    handleTouchEnd(event: WechatMiniprogram.TouchEvent) {
      if (event.touches.length) {
        this.beginGesture(event.touches)
        return
      }
      cropGestures.delete(this)
    },

    beginGesture(touches: TouchPoint[]) {
      const state = cropStates.get(this)
      if (!state || !touches.length) {
        cropGestures.delete(this)
        return
      }

      if (touches.length >= 2) {
        cropGestures.set(this, {
          mode: "scale",
          startDistance: Math.max(getTouchDistance(touches[0], touches[1]), 1),
          startScale: state.scale,
          startOffsetX: state.offsetX,
          startOffsetY: state.offsetY
        })
        return
      }

      cropGestures.set(this, {
        mode: "move",
        startClientX: touches[0].clientX,
        startClientY: touches[0].clientY,
        startOffsetX: state.offsetX,
        startOffsetY: state.offsetY
      })
    },

    syncTransform(state: CropState, ready = false) {
      this.setData({
        ready: ready || this.data.ready,
        displayWidth: state.naturalWidth * state.scale,
        displayHeight: state.naturalHeight * state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY
      })
    },

    handleCancel() {
      if (this.data.processing) return
      this.triggerEvent("cancel")
    },

    async handleConfirm() {
      const state = cropStates.get(this)
      if (!state || this.data.processing) return

      // Normalize once more before exporting so stale or rounded gesture data
      // can never request pixels outside the source image.
      applyTransform(state, state.scale, state.offsetX, state.offsetY)

      this.setData({ processing: true })
      wx.showLoading({ title: "裁剪中", mask: true })

      try {
        const canvas = await this.getCanvas()
        const image = await loadCanvasImage(canvas, this.properties.src)
        const outputWidth = Math.max(Number(this.properties.outputSize) || 1080, 320)
        const outputHeight = Math.max(
          Math.round(outputWidth / Math.max(Number(this.properties.aspectRatio) || 1, 0.5)),
          320
        )
        const sourceWidth = Math.min(state.viewportWidth / state.scale, state.naturalWidth)
        const sourceHeight = Math.min(
          state.viewportHeight / state.scale,
          state.naturalHeight
        )
        const sourceX = Math.min(
          Math.max(-state.offsetX / state.scale, 0),
          state.naturalWidth - sourceWidth
        )
        const sourceY = Math.min(
          Math.max(-state.offsetY / state.scale, 0),
          state.naturalHeight - sourceHeight
        )

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

        const tempFilePath = await canvasToTempFilePath(canvas, outputWidth, outputHeight)
        this.triggerEvent("confirm", { tempFilePath })
      } catch (error) {
        console.error("裁剪图片失败", error)
        this.triggerEvent("error", { message: "图片裁剪失败，请重试" })
      } finally {
        wx.hideLoading()
        this.setData({ processing: false })
      }
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

function getTouchDistance(first: TouchPoint, second: TouchPoint) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

function clampScale(state: CropState, scale: number) {
  return Math.min(Math.max(scale, state.minScale), state.minScale * 5)
}

function applyTransform(
  state: CropState,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const nextScale = clampScale(state, scale)
  const displayWidth = state.naturalWidth * nextScale
  const displayHeight = state.naturalHeight * nextScale

  state.scale = nextScale
  state.offsetX = clampOffset(
    offsetX,
    state.viewportWidth,
    displayWidth
  )
  state.offsetY = clampOffset(
    offsetY,
    state.viewportHeight,
    displayHeight
  )
}

function clampOffset(offset: number, viewportSize: number, displaySize: number) {
  const minimum = viewportSize - displaySize + EDGE_GUARD_PX
  const maximum = -EDGE_GUARD_PX
  return Math.min(maximum, Math.max(minimum, offset))
}

function loadCanvasImage(canvas: CanvasNode, src: string) {
  return new Promise<CanvasImage>((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function canvasToTempFilePath(canvas: CanvasNode, outputWidth: number, outputHeight: number) {
  return new Promise<string>((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      width: outputWidth,
      height: outputHeight,
      destWidth: outputWidth,
      destHeight: outputHeight,
      fileType: "png",
      success: (result) => resolve(result.tempFilePath),
      fail: reject
    })
  })
}

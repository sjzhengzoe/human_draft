export type TextCardCanvasImage = {
  src: string
  onload: (() => void) | null
  onerror: ((error: unknown) => void) | null
}

export type TextCardCanvasContext = {
  fillStyle: string
  font: string
  textAlign: "left" | "right" | "center" | "start" | "end"
  textBaseline:
    | "top"
    | "hanging"
    | "middle"
    | "alphabetic"
    | "ideographic"
    | "bottom"
  clearRect: (x: number, y: number, width: number, height: number) => void
  drawImage: {
    (image: unknown, x: number, y: number, width: number, height: number): void
    (
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
  fillRect: (x: number, y: number, width: number, height: number) => void
  fillText: (text: string, x: number, y: number) => void
  measureText: (text: string) => { width: number }
  scale: (x: number, y: number) => void
  save: () => void
  restore: () => void
  beginPath: () => void
  arc: (
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ) => void
  clip: () => void
}

export type TextCardCanvasNode = {
  width: number
  height: number
  getContext: (contextId: "2d") => TextCardCanvasContext
  createImage: () => TextCardCanvasImage
}

type TextCardSelectorQueryOwner = {
  createSelectorQuery: () => {
    select: (selector: string) => {
      node: (
        callback: (result: { node?: unknown } | null | undefined) => void
      ) => { exec: () => void }
    }
  }
}

type TextCardCanvasImageFactory<TImage extends TextCardCanvasImage> = {
  createImage: () => TImage
}

type TextCardCanvasExportNode = {
  width: number
  height: number
}

export function createPreviewSignature(version: string, content: string): string {
  return `${version}\u0000${content}`
}

export function saveImageToPhotosAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: reject
    })
  })
}

export function loadCanvasImage<TImage extends TextCardCanvasImage>(
  canvas: TextCardCanvasImageFactory<TImage>,
  src: string
): Promise<TImage> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage()

    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

export function canvasToTempFilePath(
  canvas: TextCardCanvasExportNode,
  width: number,
  height: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvas,
      width,
      height,
      destWidth: width,
      destHeight: height,
      fileType: "png",
      success: (result) => resolve(result.tempFilePath),
      fail: reject
    })
  })
}

export function getTextCardCanvas(
  owner: TextCardSelectorQueryOwner,
  canvasId: string
): Promise<TextCardCanvasNode> {
  return new Promise((resolve, reject) => {
    owner
      .createSelectorQuery()
      .select(`#${canvasId}`)
      .node((result) => {
        if (result?.node) {
          resolve(result.node as TextCardCanvasNode)
          return
        }
        reject(new Error("未找到导出 canvas"))
      })
      .exec()
  })
}

export function createRenderQueue() {
  let renderChain = Promise.resolve()

  return function enqueueRender<T>(task: () => Promise<T>): Promise<T> {
    const run = renderChain.then(task, task)
    renderChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }
}

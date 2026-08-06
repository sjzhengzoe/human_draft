export type TextCardCanvasImage = {
  src: string
  onload: (() => void) | null
  onerror: ((error: unknown) => void) | null
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

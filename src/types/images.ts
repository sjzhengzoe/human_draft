export type ImageCrop = {
  x: number
  y: number
  width: number
  height: number
}

export type ImageCropResult = {
  tempFilePath: string
  sourceFilePath: string
  crop?: ImageCrop
  cropped: boolean
}

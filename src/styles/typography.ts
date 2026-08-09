export const UI_FONT_SIZES = {
  small: "20rpx",
  base: "23rpx",
  large: "25rpx"
} as const

// Canvas 使用 px；这里按小程序常用的 2rpx = 1px 与三档 UI 字号保持同步。
export const UI_CANVAS_FONT_SIZES = {
  small: 10,
  base: 11.5,
  large: 12.5
} as const

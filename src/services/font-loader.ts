import type { AppFontDefinition } from "../config/fonts"

const FONT_READY_DELAY = 80
const fontPromises = new Map<string, Promise<void>>()

function getFontCacheKey(font: AppFontDefinition) {
  return [font.family, font.source, font.weight].join("|")
}

export function loadAppFont(font: AppFontDefinition): Promise<void> {
  const cacheKey = getFontCacheKey(font)
  const cachedPromise = fontPromises.get(cacheKey)
  if (cachedPromise) return cachedPromise

  const fontPromise = new Promise<void>((resolve, reject) => {
    wx.loadFontFace({
      family: font.family,
      source: font.source,
      desc: {
        style: "normal",
        weight: font.weight
      },
      global: true,
      scopes: ["webview", "native"],
      success: () => {
        setTimeout(resolve, FONT_READY_DELAY)
      },
      fail: reject
    })
  }).catch((error: unknown) => {
    fontPromises.delete(cacheKey)
    throw error
  })

  fontPromises.set(cacheKey, fontPromise)
  return fontPromise
}

import type { AppFontDefinition } from "../config/fonts"

const FONT_READY_DELAY = 80
const fontLoadPromises = new Map<string, Promise<void>>()

function getFontLoadKey(font: AppFontDefinition) {
  return [font.family, font.url, font.weight].join("|")
}

function registerFontFace(font: AppFontDefinition): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (readyTimer) clearTimeout(readyTimer)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    wx.loadFontFace({
      family: font.family,
      source: `url("${font.url}")`,
      desc: {
        style: "normal",
        weight: font.weight
      },
      global: true,
      scopes: ["webview", "native"],
      success: () => {
        readyTimer = setTimeout(() => finish(), FONT_READY_DELAY)
      },
      fail: finish
    })
  })
}

export function loadAppFont(font: AppFontDefinition): Promise<void> {
  const loadKey = getFontLoadKey(font)
  const existingPromise = fontLoadPromises.get(loadKey)
  if (existingPromise) return existingPromise

  const fontPromise = registerFontFace(font)

  fontLoadPromises.set(loadKey, fontPromise)
  void fontPromise.catch(() => {
    if (fontLoadPromises.get(loadKey) === fontPromise) {
      fontLoadPromises.delete(loadKey)
    }
  })
  return fontPromise
}

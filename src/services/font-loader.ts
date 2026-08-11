import type { AppFontDefinition } from "../config/fonts"

const FONT_READY_DELAY = 80
const DEFAULT_FONT_LOAD_TIMEOUT = 10000
const fontPromises = new Map<string, Promise<void>>()

class FontLoadTimeoutError extends Error {}

type FontLoadOptions = {
  timeoutMs?: number
}

function getFontCacheKey(font: AppFontDefinition) {
  return [font.family, font.source, font.weight].join("|")
}

export function loadAppFont(
  font: AppFontDefinition,
  options: FontLoadOptions = {}
): Promise<void> {
  const cacheKey = getFontCacheKey(font)
  const cachedPromise = fontPromises.get(cacheKey)
  if (cachedPromise) return cachedPromise
  const timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT

  const fontPromise = new Promise<void>((resolve, reject) => {
    let settled = false
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    const timeoutTimer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new FontLoadTimeoutError(`字体加载超时：${font.name}`))
    }, timeoutMs)
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (readyTimer) clearTimeout(readyTimer)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

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
        readyTimer = setTimeout(() => finish(), FONT_READY_DELAY)
      },
      fail: finish
    })
  }).catch((error: unknown) => {
    if (!(error instanceof FontLoadTimeoutError)) {
      fontPromises.delete(cacheKey)
    }
    throw error
  })

  fontPromises.set(cacheKey, fontPromise)
  return fontPromise
}

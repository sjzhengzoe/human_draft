import type { AppFontDefinition } from "../config/fonts"

const FONT_READY_DELAY = 80
const DEFAULT_FONT_LOAD_TIMEOUT = 10000
const FONT_DOWNLOAD_TIMEOUT = 60000
const FONT_CACHE_STORAGE_PREFIX = "app-font-cache:"
const fontPromises = new Map<string, Promise<void>>()

class FontLoadTimeoutError extends Error {}

type FontLoadOptions = {
  timeoutMs?: number
  forceReload?: boolean
  usePersistentCache?: boolean
}

function getFontCacheKey(font: AppFontDefinition) {
  return [font.family, font.source, font.weight].join("|")
}

function getPersistentFontPath(font: AppFontDefinition) {
  const cache = font.persistentCache
  return cache ? `${wx.env.USER_DATA_PATH}/${cache.fileName}` : ""
}

function getPersistentFontVersionKey(font: AppFontDefinition) {
  return `${FONT_CACHE_STORAGE_PREFIX}${font.family}`
}

function removeFile(filePath: string): Promise<void> {
  if (!filePath) return Promise.resolve()
  return new Promise((resolve) => {
    wx.getFileSystemManager().unlink({
      filePath,
      success: () => resolve(),
      fail: () => resolve()
    })
  })
}

function readFontFileAsBase64(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: "base64",
      success: ({ data }) => {
        const base64 = typeof data === "string" ? data : ""
        if (!base64.startsWith("d09GMg")) {
          reject(new Error("本地字体缓存不是有效的 WOFF2 文件"))
          return
        }
        resolve(base64)
      },
      fail: reject
    })
  })
}

function downloadFontFile(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      timeout: FONT_DOWNLOAD_TIMEOUT,
      success: ({ statusCode, tempFilePath }) => {
        if (statusCode < 200 || statusCode >= 300 || !tempFilePath) {
          reject(new Error(`字体下载失败：HTTP ${statusCode}`))
          return
        }
        resolve(tempFilePath)
      },
      fail: reject
    })
  })
}

function saveFontFile(tempFilePath: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      filePath,
      success: () => resolve(),
      fail: reject
    })
  })
}

async function getPersistentFontSource(font: AppFontDefinition): Promise<string> {
  const cache = font.persistentCache
  if (!cache) return font.source

  const filePath = getPersistentFontPath(font)
  const versionKey = getPersistentFontVersionKey(font)
  const savedVersion = wx.getStorageSync<string>(versionKey)

  if (savedVersion === cache.version) {
    try {
      const base64 = await readFontFileAsBase64(filePath)
      return `url("data:font/woff2;base64,${base64}")`
    } catch {
      await removeFile(filePath)
    }
  } else {
    await removeFile(filePath)
  }

  const tempFilePath = await downloadFontFile(font.url)
  await saveFontFile(tempFilePath, filePath)
  const base64 = await readFontFileAsBase64(filePath)
  wx.setStorageSync(versionKey, cache.version)
  return `url("data:font/woff2;base64,${base64}")`
}

function registerFontFace(
  font: AppFontDefinition,
  source: string,
  timeoutMs: number
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let readyTimer: ReturnType<typeof setTimeout> | undefined
    const timeoutTimer = timeoutMs > 0
      ? setTimeout(() => {
          if (settled) return
          settled = true
          reject(new FontLoadTimeoutError(`字体加载超时：${font.name}`))
        }, timeoutMs)
      : undefined
    const finish = (error?: unknown) => {
      if (settled) return
      settled = true
      if (timeoutTimer) clearTimeout(timeoutTimer)
      if (readyTimer) clearTimeout(readyTimer)
      if (error) {
        reject(error)
        return
      }
      resolve()
    }

    wx.loadFontFace({
      family: font.family,
      source,
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

export function loadAppFont(
  font: AppFontDefinition,
  options: FontLoadOptions = {}
): Promise<void> {
  const cacheKey = getFontCacheKey(font)
  const cachedPromise = fontPromises.get(cacheKey)
  if (cachedPromise && !options.forceReload) return cachedPromise
  const timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT

  const fontPromise = (async () => {
    let source = font.source
    if (font.persistentCache && options.usePersistentCache !== false) {
      try {
        source = await getPersistentFontSource(font)
      } catch {
        source = font.source
      }
    }

    try {
      await registerFontFace(font, source, timeoutMs)
    } catch (error) {
      if (source === font.source) throw error
      await registerFontFace(font, font.source, timeoutMs)
    }
  })().catch((error: unknown) => {
    if (!(error instanceof FontLoadTimeoutError)) {
      fontPromises.delete(cacheKey)
    }
    throw error
  })

  fontPromises.set(cacheKey, fontPromise)
  return fontPromise
}

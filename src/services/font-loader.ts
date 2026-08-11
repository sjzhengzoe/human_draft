import type { AppFontDefinition } from "../config/fonts"

const FONT_READY_DELAY = 80
const DEFAULT_FONT_LOAD_TIMEOUT = 10000
const FONT_DOWNLOAD_TIMEOUT = 60000
const FONT_CACHE_STORAGE_PREFIX = "app-font-cache:"
const cachedFontFilePromises = new Map<string, Promise<string>>()
const cachedFontSourcePromises = new Map<string, Promise<string>>()
const fontRegistrationPromises = new Map<string, Promise<void>>()

class FontLoadTimeoutError extends Error {}

type FontLoadOptions = {
  timeoutMs?: number
  forceRegister?: boolean
}

function getFontCacheKey(font: AppFontDefinition) {
  return [
    font.family,
    font.persistentCache.version,
    font.persistentCache.fileName,
    font.weight
  ].join("|")
}

function getPersistentFontPath(font: AppFontDefinition) {
  return `${wx.env.USER_DATA_PATH}/${font.persistentCache.fileName}`
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

function fileExists(filePath: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.getFileSystemManager().access({
      path: filePath,
      success: () => resolve(true),
      fail: () => resolve(false)
    })
  })
}

function getSharedPromise<T>(
  cache: Map<string, Promise<T>>,
  cacheKey: string,
  createPromise: () => Promise<T>
) {
  const cachedPromise = cache.get(cacheKey)
  if (cachedPromise) return cachedPromise

  const promise = createPromise()
  cache.set(cacheKey, promise)
  void promise.catch(() => {
    if (cache.get(cacheKey) === promise) cache.delete(cacheKey)
  })
  return promise
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
  const cacheKey = getFontCacheKey(font)
  return getSharedPromise(cachedFontSourcePromises, cacheKey, async () => {
    let filePath = await getPersistentFontFile(font)
    let base64: string

    try {
      base64 = await readFontFileAsBase64(filePath)
    } catch {
      await invalidatePersistentFontFile(font)
      filePath = await getPersistentFontFile(font)
      base64 = await readFontFileAsBase64(filePath)
    }

    return `url("data:font/woff2;base64,${base64}")`
  })
}

type StoredFontCache = {
  fileName: string
  version: string
}

function isCurrentFontCache(
  value: unknown,
  font: AppFontDefinition
): boolean {
  const cache = font.persistentCache
  if (value === cache.version) return true
  if (!value || typeof value !== "object") return false
  const stored = value as Partial<StoredFontCache>
  return stored.version === cache.version && stored.fileName === cache.fileName
}

function getPersistentFontFile(font: AppFontDefinition): Promise<string> {
  const cacheKey = getFontCacheKey(font)
  return getSharedPromise(cachedFontFilePromises, cacheKey, async () => {
    const filePath = getPersistentFontPath(font)
    const versionKey = getPersistentFontVersionKey(font)
    const storedCache = wx.getStorageSync<unknown>(versionKey)

    if (isCurrentFontCache(storedCache, font) && await fileExists(filePath)) {
      if (typeof storedCache === "string") {
        wx.setStorageSync(versionKey, font.persistentCache)
      }
      return filePath
    }

    await removeFile(filePath)
    wx.removeStorageSync(versionKey)
    const tempFilePath = await downloadFontFile(font.url)
    await saveFontFile(tempFilePath, filePath)
    wx.setStorageSync(versionKey, font.persistentCache)
    return filePath
  })
}

async function invalidatePersistentFontFile(font: AppFontDefinition) {
  const cacheKey = getFontCacheKey(font)
  cachedFontFilePromises.delete(cacheKey)
  wx.removeStorageSync(getPersistentFontVersionKey(font))
  await removeFile(getPersistentFontPath(font))
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
  const cachedPromise = fontRegistrationPromises.get(cacheKey)
  if (cachedPromise && !options.forceRegister) return cachedPromise
  const timeoutMs = options.timeoutMs ?? DEFAULT_FONT_LOAD_TIMEOUT

  const fontPromise = (async () => {
    const source = await getPersistentFontSource(font)
    await registerFontFace(font, source, timeoutMs)
  })()

  fontRegistrationPromises.set(cacheKey, fontPromise)
  void fontPromise.catch(() => {
    if (fontRegistrationPromises.get(cacheKey) === fontPromise) {
      fontRegistrationPromises.delete(cacheKey)
    }
  })
  return fontPromise
}

export type TextCardTemplate = "xiaohongshu" | "douyin2" | "douyin3"

const MAX_PREVIEW_CACHE_ENTRIES = 8
const previewCache = new Map<string, string[]>()

function getPreviewCacheKey(template: TextCardTemplate, signature: string) {
  return `${template}\u0000${signature}`
}

export function getCachedTextCardPreview(
  template: TextCardTemplate,
  signature: string
) {
  const cacheKey = getPreviewCacheKey(template, signature)
  const cachedUrls = previewCache.get(cacheKey)
  if (!cachedUrls) return undefined

  previewCache.delete(cacheKey)
  previewCache.set(cacheKey, cachedUrls)
  return [...cachedUrls]
}

export function cacheTextCardPreview(
  template: TextCardTemplate,
  signature: string,
  urls: string[]
) {
  if (!urls.length) return

  const cacheKey = getPreviewCacheKey(template, signature)
  previewCache.delete(cacheKey)
  previewCache.set(cacheKey, [...urls])

  while (previewCache.size > MAX_PREVIEW_CACHE_ENTRIES) {
    const oldestKey = previewCache.keys().next().value as string | undefined
    if (!oldestKey) break
    previewCache.delete(oldestKey)
  }
}

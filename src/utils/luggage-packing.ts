const STORAGE_KEY_PREFIX = "LUGGAGE_PACKED_ITEM_IDS_V1"

function storageKey(userId: string, sceneId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}:${sceneId}`
}

export function readLuggagePackedItemIds(userId: string, sceneId: string): Set<string> {
  if (!userId || !sceneId) return new Set()
  try {
    const stored = wx.getStorageSync(storageKey(userId, sceneId))
    if (!Array.isArray(stored)) return new Set()
    return new Set(stored.filter((id): id is string => typeof id === "string" && Boolean(id)))
  } catch {
    return new Set()
  }
}

export function saveLuggagePackedItemIds(
  userId: string,
  sceneId: string,
  itemIds: Set<string>
): boolean {
  if (!userId || !sceneId) return false
  try {
    const stored = [...itemIds].filter(Boolean).sort()
    if (stored.length === 0) wx.removeStorageSync(storageKey(userId, sceneId))
    else wx.setStorageSync(storageKey(userId, sceneId), stored)
    return true
  } catch {
    return false
  }
}

export function clearLuggagePackedItemIds(userId: string, sceneId: string): boolean {
  if (!userId || !sceneId) return false
  try {
    wx.removeStorageSync(storageKey(userId, sceneId))
    return true
  } catch {
    return false
  }
}

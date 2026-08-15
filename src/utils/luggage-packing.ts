const STORAGE_KEY_PREFIX = "LUGGAGE_PACKED_ITEM_IDS_V1"

function storageKey(uid: string, sceneId: string): string {
  return `${STORAGE_KEY_PREFIX}:${uid}:${sceneId}`
}

export function readLuggagePackedItemIds(uid: string, sceneId: string): Set<string> {
  if (!uid || !sceneId) return new Set()
  try {
    const stored = wx.getStorageSync(storageKey(uid, sceneId))
    if (!Array.isArray(stored)) return new Set()
    return new Set(stored.filter((id): id is string => typeof id === "string" && Boolean(id)))
  } catch {
    return new Set()
  }
}

export function saveLuggagePackedItemIds(
  uid: string,
  sceneId: string,
  itemIds: Set<string>
): boolean {
  if (!uid || !sceneId) return false
  try {
    const stored = [...itemIds].filter(Boolean).sort()
    if (stored.length === 0) wx.removeStorageSync(storageKey(uid, sceneId))
    else wx.setStorageSync(storageKey(uid, sceneId), stored)
    return true
  } catch {
    return false
  }
}

export function clearLuggagePackedItemIds(uid: string, sceneId: string): boolean {
  if (!uid || !sceneId) return false
  try {
    wx.removeStorageSync(storageKey(uid, sceneId))
    return true
  } catch {
    return false
  }
}

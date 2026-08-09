export type KeyMomentDisplayLayout = "horizontal" | "vertical"

export const DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT: KeyMomentDisplayLayout = "horizontal"

const STORAGE_KEY_PREFIX = "KEY_MOMENT_DISPLAY_LAYOUT_V1"

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`
}

export function isKeyMomentDisplayLayout(value: unknown): value is KeyMomentDisplayLayout {
  return value === "horizontal" || value === "vertical"
}

export function getKeyMomentDisplayLayout(userId: string): KeyMomentDisplayLayout {
  if (!userId) return DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  try {
    const stored = wx.getStorageSync(storageKey(userId))
    return isKeyMomentDisplayLayout(stored)
      ? stored
      : DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  } catch {
    return DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  }
}

export function setKeyMomentDisplayLayout(
  userId: string,
  layout: KeyMomentDisplayLayout
): boolean {
  if (!userId || !isKeyMomentDisplayLayout(layout)) return false
  try {
    wx.setStorageSync(storageKey(userId), layout)
    return true
  } catch {
    return false
  }
}

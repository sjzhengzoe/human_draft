export type KeyMomentDisplayLayout = "horizontal" | "vertical"

export const DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT: KeyMomentDisplayLayout = "horizontal"

const STORAGE_KEY_PREFIX = "KEY_MOMENT_DISPLAY_LAYOUT_V1"

function storageKey(uid: string): string {
  return `${STORAGE_KEY_PREFIX}:${uid}`
}

export function isKeyMomentDisplayLayout(value: unknown): value is KeyMomentDisplayLayout {
  return value === "horizontal" || value === "vertical"
}

export function getKeyMomentDisplayLayout(uid: string): KeyMomentDisplayLayout {
  if (!uid) return DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  try {
    const stored = wx.getStorageSync(storageKey(uid))
    return isKeyMomentDisplayLayout(stored)
      ? stored
      : DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  } catch {
    return DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT
  }
}

export function setKeyMomentDisplayLayout(
  uid: string,
  layout: KeyMomentDisplayLayout
): boolean {
  if (!uid || !isKeyMomentDisplayLayout(layout)) return false
  try {
    wx.setStorageSync(storageKey(uid), layout)
    return true
  } catch {
    return false
  }
}

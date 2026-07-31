const FALLBACK_STATUS_BAR_HEIGHT = 24
const FALLBACK_NAVIGATION_HEIGHT = 48
const CONTENT_GAP = 8

export function getCustomPageTop(): number {
  try {
    const menuButton = wx.getMenuButtonBoundingClientRect()
    if (menuButton.bottom > 0) {
      return Math.ceil(menuButton.bottom + CONTENT_GAP)
    }
  } catch {
    // Fall back to system metrics when the menu button is unavailable.
  }

  const systemInfo = wx.getSystemInfoSync()
  const statusBarHeight = systemInfo.statusBarHeight || FALLBACK_STATUS_BAR_HEIGHT
  return Math.ceil(statusBarHeight + FALLBACK_NAVIGATION_HEIGHT)
}

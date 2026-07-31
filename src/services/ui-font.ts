import { UI_FONT } from "../config/ui-font"

let uiFontPromise: Promise<void> | undefined

export function initializeUIFont(): Promise<void> {
  if (uiFontPromise) return uiFontPromise

  uiFontPromise = new Promise<void>((resolve, reject) => {
    wx.loadFontFace({
      family: UI_FONT.family,
      source: UI_FONT.source,
      desc: {
        style: "normal",
        weight: "normal"
      },
      global: true,
      scopes: ["webview", "native"],
      success: () => resolve(),
      fail: reject
    })
  })

  uiFontPromise.catch(() => {
    uiFontPromise = undefined
  })
  return uiFontPromise
}

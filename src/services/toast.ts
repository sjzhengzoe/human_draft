export const DEFAULT_TOAST_DURATION = 3000

let initialized = false

export function initializeToastDefaults(): void {
  if (initialized) return
  initialized = true

  const nativeShowToast = wx.showToast.bind(wx)
  wx.showToast = ((options) => nativeShowToast({
    ...options,
    duration: options.duration ?? DEFAULT_TOAST_DURATION
  })) as typeof wx.showToast
}

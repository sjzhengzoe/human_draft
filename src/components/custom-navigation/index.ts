const FALLBACK_STATUS_BAR_HEIGHT = 24
const FALLBACK_NAVIGATION_BAR_HEIGHT = 44

function getNavigationMetrics() {
  const systemInfo = wx.getSystemInfoSync()
  const statusBarHeight = systemInfo.statusBarHeight || FALLBACK_STATUS_BAR_HEIGHT

  try {
    const menuButton = wx.getMenuButtonBoundingClientRect()
    if (menuButton.top >= statusBarHeight && menuButton.height > 0) {
      const capsuleGap = menuButton.top - statusBarHeight
      const navigationBarHeight = Math.max(
        FALLBACK_NAVIGATION_BAR_HEIGHT,
        capsuleGap * 2 + menuButton.height
      )
      return {
        statusBarHeight,
        navigationBarHeight,
        totalNavigationHeight: statusBarHeight + navigationBarHeight
      }
    }
  } catch {
    // Use standard navigation metrics when the capsule is unavailable.
  }

  return {
    statusBarHeight,
    navigationBarHeight: FALLBACK_NAVIGATION_BAR_HEIGHT,
    totalNavigationHeight: statusBarHeight + FALLBACK_NAVIGATION_BAR_HEIGHT
  }
}

Component({
  data: getNavigationMetrics(),
  properties: {
    title: {
      type: String,
      value: ""
    },
    background: {
      type: String,
      value: "#ffffff"
    },
    showBack: {
      type: Boolean,
      value: true
    },
    customBack: {
      type: Boolean,
      value: false
    },
    compactTitle: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    handleBack() {
      if (this.data.customBack) {
        this.triggerEvent("back")
        return
      }

      if (getCurrentPages().length > 1) {
        wx.navigateBack()
        return
      }

      wx.switchTab({
        url: "/pages/create/index"
      })
    }
  }
})

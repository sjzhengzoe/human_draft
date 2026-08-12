import { APP_FONTS } from "./config/fonts"
import { getCurrentUser } from "./services/auth"
import { loadAppFont } from "./services/font-loader"
import { initializeToastDefaults } from "./services/toast"
import { initializeUIFont } from "./services/ui-font"

const RED3_PRELOAD_RETRY_DELAY = 3000
const RED3_PRELOAD_MAX_RETRIES = 3

function preloadRed3Font(retriesRemaining = RED3_PRELOAD_MAX_RETRIES) {
  void loadAppFont(APP_FONTS.red3).catch(() => {
    if (retriesRemaining <= 0) return
    setTimeout(
      () => preloadRed3Font(retriesRemaining - 1),
      RED3_PRELOAD_RETRY_DELAY
    )
  })
}

App<IAppOption>({
  globalData: {
    currentUser: null
  },
  onLaunch() {
    initializeToastDefaults()
    this.globalData.currentUser = getCurrentUser()
    void initializeUIFont().catch(() => undefined)
    preloadRed3Font()
  },
  onShow() {
    const user = getCurrentUser()
    this.globalData.currentUser = user
  }
})

import { APP_FONTS } from "./config/fonts"
import { getCurrentUser } from "./services/auth"
import { loadAppFont } from "./services/font-loader"
import { initializeToastDefaults } from "./services/toast"
import { initializeUIFont } from "./services/ui-font"

App<IAppOption>({
  globalData: {
    currentUser: null
  },
  onLaunch() {
    initializeToastDefaults()
    this.globalData.currentUser = getCurrentUser()
    void initializeUIFont().catch(() => undefined)
    void loadAppFont(APP_FONTS.red3, { timeoutMs: 0 }).catch(() => undefined)
  },
  onShow() {
    const user = getCurrentUser()
    this.globalData.currentUser = user
  }
})

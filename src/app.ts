import { getCurrentUser } from "./services/auth"
import { initializeUIFont } from "./services/ui-font"

App<IAppOption>({
  globalData: {
    currentUser: null
  },
  onLaunch() {
    this.globalData.currentUser = getCurrentUser()
    void initializeUIFont().catch(() => undefined)
  },
  onShow() {
    const user = getCurrentUser()
    this.globalData.currentUser = user
  }
})

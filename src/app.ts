import { getCurrentUser } from "./services/auth"

App<IAppOption>({
  globalData: {
    currentUser: null
  },
  onLaunch() {
    this.globalData.currentUser = getCurrentUser()
  },
  onShow() {
    const user = getCurrentUser()
    this.globalData.currentUser = user
  }
})

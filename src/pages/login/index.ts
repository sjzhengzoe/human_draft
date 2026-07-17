import { getCurrentUser, loginExistingUser } from "../../services/auth"
import { hideGlobalLoading, showGlobalLoading } from "../../services/loading"
import type { AppUser } from "../../types/api"

function enterApp(user: AppUser): Promise<void> {
  getApp<IAppOption>().globalData.currentUser = user
  showGlobalLoading("正在进入…")

  return new Promise((resolve, reject) => {
    wx.switchTab({
      url: "/pages/create/index",
      success: () => resolve(),
      fail: (result) => {
        hideGlobalLoading()
        reject(new Error(result.errMsg || "无法打开首页，请重试。"))
      }
    })
  })
}

Page({
  data: {
    preparingProfile: false,
    errorMessage: ""
  },

  onShow() {
    const user = getCurrentUser()
    if (!user) return
    void enterApp(user).catch((error) => {
      this.setData({
        errorMessage: error instanceof Error ? error.message : "无法打开首页，请重试"
      })
    })
  },

  async handleLoginTap() {
    if (this.data.preparingProfile) return
    this.setData({ preparingProfile: true, errorMessage: "" })
    try {
      const session = await loginExistingUser()
      await enterApp(session.user)
    } catch (error) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : "登录失败，请稍后重试"
      })
    } finally {
      this.setData({ preparingProfile: false })
    }
  },

  handleSkipTap() {
    wx.switchTab({ url: "/pages/create/index" })
  }
})

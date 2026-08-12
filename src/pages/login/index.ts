import { getCurrentUser, loginExistingUser } from "../../services/auth"
import { hideGlobalLoading, showGlobalLoading } from "../../services/loading"
import type { AppUser } from "../../types/api"
import { getHomeModulePath, recordHomeModuleUsed } from "../../utils/home-modules"

function enterApp(user: AppUser, homeModuleKey = ""): Promise<void> {
  getApp<IAppOption>().globalData.currentUser = user
  showGlobalLoading("正在进入…")
  const targetPath = getHomeModulePath(homeModuleKey)

  return new Promise((resolve, reject) => {
    if (targetPath) {
      wx.redirectTo({
        url: targetPath,
        success: () => {
          recordHomeModuleUsed(homeModuleKey)
          hideGlobalLoading()
          resolve()
        },
        fail: (result) => {
          hideGlobalLoading()
          reject(new Error(result.errMsg || "无法打开目标功能，请重试。"))
        }
      })
      return
    }

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
    errorMessage: "",
    pendingHomeModuleKey: ""
  },

  onLoad(options: Record<string, string | undefined>) {
    const moduleKey = String(options.module || "")
    if (getHomeModulePath(moduleKey)) {
      this.setData({ pendingHomeModuleKey: moduleKey })
    }
  },

  onShow() {
    const user = getCurrentUser()
    if (!user) return
    void enterApp(user, this.data.pendingHomeModuleKey).catch((error) => {
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
      await enterApp(session.user, this.data.pendingHomeModuleKey)
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

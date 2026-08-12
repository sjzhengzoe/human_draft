import { getCurrentUser, logout } from "../../services/auth"
import { UI_COLORS } from "../../styles/colors"
import { updateAppTabBarState } from "../../utils/tab-bar"

type SettingsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  navigationLocked?: boolean
  logoutPending?: boolean
  failedAvatarSignature?: string
}

function getSettingsAccountState(failedAvatarSignature = "") {
  const user = getCurrentUser()
  if (!user) {
    return {
      loggedIn: false,
      displayName: "未登录",
      avatarUrl: "",
      avatarInitial: "E",
      isAdmin: false
    }
  }

  const avatarSignature = `${user.id}|${user.avatar_url}`
  return {
    loggedIn: true,
    displayName: user.display_name,
    avatarUrl: avatarSignature === failedAvatarSignature ? "" : user.avatar_url,
    avatarInitial: user.display_name.trim().slice(0, 1) || "E",
    isAdmin: user.is_admin
  }
}

Component({
  data: {
    ...getSettingsAccountState(),
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      const page = this as SettingsPageInstance
      page.navigationLocked = false
      const tabBar = page.getTabBar && page.getTabBar()
      updateAppTabBarState(tabBar, { selected: 1, hidden: false })

      const nextAccountState = getSettingsAccountState(page.failedAvatarSignature)
      const accountChanged =
        nextAccountState.loggedIn !== this.data.loggedIn ||
        nextAccountState.displayName !== this.data.displayName ||
        nextAccountState.avatarUrl !== this.data.avatarUrl ||
        nextAccountState.avatarInitial !== this.data.avatarInitial ||
        nextAccountState.isAdmin !== this.data.isAdmin
      if (accountChanged) this.setData(nextAccountState)
    }
  },
  methods: {
    handleAvatarError() {
      const user = getCurrentUser()
      if (!user || !this.data.avatarUrl) return
      const page = this as SettingsPageInstance
      page.failedAvatarSignature = `${user.id}|${this.data.avatarUrl}`
      this.setData({ avatarUrl: "" })
    },
    handleLoginTap() {
      const page = this as SettingsPageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/login/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleLogoutTap() {
      const page = this as SettingsPageInstance
      if (page.logoutPending) return
      page.logoutPending = true
      wx.showModal({
        title: "退出登录",
        content: "退出后需要重新点击微信账号登录。",
        confirmText: "退出",
        confirmColor: UI_COLORS.actionPrimary,
        success: async (result) => {
          if (!result.confirm) {
            page.logoutPending = false
            return
          }
          wx.showLoading({ title: "正在退出" })
          try {
            await logout()
          } finally {
            wx.hideLoading()
            wx.switchTab({
              url: "/pages/create/index",
              fail: () => wx.showToast({ title: "暂时无法返回首页", icon: "none" }),
              complete: () => {
                page.logoutPending = false
              }
            })
          }
        },
        fail: () => {
          page.logoutPending = false
          wx.showToast({ title: "暂时无法退出，请重试", icon: "none" })
        }
      })
    },
    handleModuleSettingsTap() {
      const page = this as SettingsPageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/home-modules/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    }
  }
})

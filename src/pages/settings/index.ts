import { getCurrentUser, logout } from "../../services/auth"
import { UI_COLORS } from "../../styles/colors"

type SettingsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
}

Component({
  data: {
    ready: false,
    loggedIn: false,
    displayName: "",
    avatarUrl: "",
    avatarInitial: "E",
    isAdmin: false,
    openid: "",
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      const page = this as SettingsPageInstance
      const tabBar = page.getTabBar && page.getTabBar()
      if (tabBar) tabBar.setData({ selected: 1, hidden: false })

      const user = getCurrentUser()
      if (!user) {
        this.setData({
          ready: true,
          loggedIn: false,
          displayName: "游客",
          avatarUrl: "",
          avatarInitial: "E",
          isAdmin: false,
          openid: ""
        })
        return
      }

      this.setData({
        ready: true,
        loggedIn: true,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        avatarInitial: user.display_name.trim().slice(0, 1) || "E",
        isAdmin: user.is_admin,
        openid: user.openid
      })
    }
  },
  methods: {
    handleLoginTap() {
      wx.navigateTo({ url: "/pages/login/index" })
    },
    handleLogoutTap() {
      wx.showModal({
        title: "退出登录",
        content: "退出后需要重新点击微信账号登录。",
        confirmText: "退出",
        confirmColor: UI_COLORS.actionPrimary,
        success: async (result) => {
          if (!result.confirm) return
          wx.showLoading({ title: "正在退出" })
          try {
            await logout()
          } finally {
            wx.hideLoading()
            this.setData({ ready: false })
            wx.switchTab({ url: "/pages/create/index" })
          }
        }
      })
    },
    handleCopyOpenIdTap() {
      if (!this.data.openid) return
      wx.setClipboardData({
        data: this.data.openid,
        success: () => wx.showToast({ title: "账号 ID 已复制", icon: "success" })
      })
    },
    handleModuleSettingsTap() {
      wx.navigateTo({
        url: "/pages/settings/home-modules/index",
        fail: () => wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
      })
    }
  }
})

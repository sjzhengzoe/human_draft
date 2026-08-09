import { getCurrentUser, logout } from "../../services/auth"
import {
  getHomeModuleSettingGroups,
  setHomeModuleVisible
} from "../../utils/home-modules"
import { UI_COLORS } from "../../styles/colors"

type SettingsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
}

function setTabBarHidden(instance: WechatMiniprogram.Component.TrivialInstance, hidden: boolean) {
  const page = instance as SettingsPageInstance
  const tabBar = page.getTabBar && page.getTabBar()
  if (tabBar) tabBar.setData({ hidden })
}

function shortOpenId(openid: string): string {
  if (openid.length <= 14) return openid
  return `${openid.slice(0, 7)}…${openid.slice(-5)}`
}

Component({
  data: {
    ready: false,
    showModuleSettings: false,
    moduleGroups: getHomeModuleSettingGroups(),
    loggedIn: false,
    displayName: "",
    avatarUrl: "",
    avatarInitial: "E",
    isAdmin: false,
    openid: "",
    openidLabel: "",
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      const page = this as SettingsPageInstance
      const tabBar = page.getTabBar && page.getTabBar()
      if (tabBar) tabBar.setData({ selected: 1, hidden: this.data.showModuleSettings })

      const user = getCurrentUser()
      if (!user) {
        this.setData({
          ready: true,
          loggedIn: false,
          displayName: "游客",
          avatarUrl: "",
          avatarInitial: "E",
          isAdmin: false,
          openid: "",
          openidLabel: ""
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
        openid: user.openid,
        openidLabel: shortOpenId(user.openid)
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
        confirmColor: UI_COLORS.danger,
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
        success: () => wx.showToast({ title: "OpenID 已复制", icon: "success" })
      })
    },
    handleModuleSettingsTap() {
      this.refreshModuleSettings()
      this.setData({ showModuleSettings: true })
      setTabBarHidden(this, true)
    },
    handleModuleSettingsBack() {
      this.setData({ showModuleSettings: false })
      setTabBarHidden(this, false)
    },
    refreshModuleSettings() {
      this.setData({
        moduleGroups: getHomeModuleSettingGroups()
      })
    },
    handleModuleVisibleChange(
      event: WechatMiniprogram.SwitchChange<WechatMiniprogram.IAnyObject, { key?: string }>
    ) {
      const key = String(event.currentTarget.dataset.key || "")
      if (!key) return
      const updated = setHomeModuleVisible(key, event.detail.value)
      if (!updated) {
        wx.showToast({
          title: "至少保留一个首页模块",
          icon: "none"
        })
      }
      this.refreshModuleSettings()
    }
  }
})

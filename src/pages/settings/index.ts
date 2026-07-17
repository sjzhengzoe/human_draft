import { getCurrentUser, logout } from "../../services/auth"

function shortOpenId(openid: string): string {
  if (openid.length <= 14) return openid
  return `${openid.slice(0, 7)}…${openid.slice(-5)}`
}

Component({
  data: {
    ready: false,
    loggedIn: false,
    icpNumber: "粤ICP备2025373031号",
    displayName: "",
    avatarUrl: "",
    avatarInitial: "E",
    isAdmin: false,
    openid: "",
    openidLabel: ""
  },
  pageLifetimes: {
    show() {
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

      const page = this as WechatMiniprogram.Component.TrivialInstance & {
        getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
      }
      const tabBar = page.getTabBar && page.getTabBar()
      if (tabBar) tabBar.setData({ selected: 1 })

      this.setData({
        ready: true,
        loggedIn: true,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        avatarInitial: user.display_name.trim().slice(0, 1) || "E",
        isAdmin: user.can_write,
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
        confirmColor: "#b6463d",
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
    handleAboutTap() {
      const icpNumber = this.data.icpNumber
      wx.showModal({
        title: "关于",
        content: `Earth\n${icpNumber}`,
        confirmText: "复制",
        cancelText: "关闭",
        success: (result) => {
          if (result.confirm) wx.setClipboardData({ data: icpNumber })
        }
      })
    }
  }
})

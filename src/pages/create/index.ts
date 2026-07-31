import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"
import { getVisibleHomeFeatureGroups } from "../../utils/home-modules"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"

Component({
  data: {
    featureGroups: getVisibleHomeFeatureGroups()
  },
  lifetimes: {
    ready() {
      const page = this as CreatePageInstance
      page.hasRendered = true
      hideGlobalLoading()
    }
  },
  pageLifetimes: {
    show() {
      const page = this as CreatePageInstance
      const tabBar = page.getTabBar && page.getTabBar()

      if (tabBar) {
        tabBar.setData({
          selected: 0,
          hidden: false
        })
      }

      this.setData({ featureGroups: getVisibleHomeFeatureGroups() })

      if (page.hasRendered) {
        wx.nextTick(() => hideGlobalLoading())
      }
    }
  },
  methods: {
    handleFeatureTap(event: WechatMiniprogram.TouchEvent) {
      const { key, path, available, title, requiresLogin } = event.currentTarget.dataset
      const isAvailable = available === true || available === "true"
      const needsLogin = requiresLogin === true || requiresLogin === "true"

      if (!isAvailable || !path) {
        wx.showToast({
          title: `${title || "功能"}待迁移`,
          icon: "none"
        })
        return
      }

      if (needsLogin && !getCurrentUser()) {
        wx.showModal({
          title: "登录后使用",
          content: `${title || "该功能"}需要登录后保存个人内容。你可以先体验图文生成工具，或现在登录。`,
          confirmText: "去登录",
          cancelText: "暂不登录",
          success: (result) => {
            if (result.confirm) wx.navigateTo({ url: "/pages/login/index" })
          }
        })
        return
      }

      const lastTemplate = wx.getStorageSync(TEXT_CARD_TEMPLATE_STORAGE_KEY)
      const nextPath =
        key === "text-card" && lastTemplate === "douyin2"
          ? "/pages/douyin2/index"
          : String(path)

      wx.navigateTo({ url: nextPath })
    }
  }
})

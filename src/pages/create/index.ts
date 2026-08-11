import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"
import { getVisibleHomeFeatureGroups } from "../../utils/home-modules"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"

function setCreateTabBarMasked(page: CreatePageInstance, masked: boolean) {
  const tabBar = page.getTabBar && page.getTabBar()
  if (tabBar) tabBar.setData({ masked })
}

Component({
  data: {
    featureGroups: getVisibleHomeFeatureGroups(),
    loggedIn: Boolean(getCurrentUser()),
    loginDialogVisible: false,
    loginDialogContent: ""
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
          hidden: false,
          masked: false
        })
      }

      this.setData({
        featureGroups: getVisibleHomeFeatureGroups(),
        loggedIn: Boolean(getCurrentUser())
      })

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
        setCreateTabBarMasked(this as CreatePageInstance, true)
        this.setData({
          loginDialogVisible: true,
          loginDialogContent: `登录后即可使用「${title || "该功能"}」，并保存相关内容。`
        })
        return
      }

      const lastTemplate = wx.getStorageSync(TEXT_CARD_TEMPLATE_STORAGE_KEY)
      const nextPath =
        key === "text-card" &&
        (lastTemplate === "xiaohongshu" ||
          lastTemplate === "douyin2" ||
          lastTemplate === "douyin3")
          ? `${String(path)}?template=${lastTemplate}`
          : String(path)

      wx.navigateTo({ url: nextPath })
    },
    handleLoginDialogCancel() {
      setCreateTabBarMasked(this as CreatePageInstance, false)
      this.setData({ loginDialogVisible: false })
    },
    handleLoginDialogConfirm() {
      setCreateTabBarMasked(this as CreatePageInstance, false)
      this.setData({ loginDialogVisible: false })
      wx.navigateTo({ url: "/pages/login/index" })
    }
  }
})

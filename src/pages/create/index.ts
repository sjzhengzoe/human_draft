import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"

Component({
  data: {
    featureGroups: [
      {
        key: "creation",
        title: "创作工具",
        items: [
          {
            key: "text-card",
            icon: "notebook-pen-white",
            title: "图文创作",
            path: "/pages/xiaohongshu/index",
            featured: true,
            available: true,
            requiresLogin: false
          }
        ]
      },
      {
        key: "life",
        title: "生活管理",
        items: [
          {
            key: "menu",
            icon: "cooking-pot-white",
            title: "日常菜单",
            path: "/pages/menu/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "media",
            icon: "clapperboard-white",
            title: "影视清单",
            path: "/pages/media/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "activities",
            icon: "sparkles-white",
            title: "活动清单",
            path: "/pages/activities/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "exercise",
            icon: "dumbbell-white",
            title: "运动养宠",
            path: "/exercise/pages/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "luggage",
            icon: "luggage-white",
            title: "行李清单",
            path: "/pages/luggage/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "wardrobe",
            icon: "shirt-white",
            title: "衣橱尺寸",
            path: "/pages/wardrobe/index",
            available: true,
            requiresLogin: true
          }
        ]
      }
    ]
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
          selected: 0
        })
      }

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

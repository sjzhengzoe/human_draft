import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"
const HOME_FONT_FAMILY = "HumanDraftLanting"
const HOME_FONT_URL =
  "https://gufeifei.cn/fonts/FZLTHProGlobal-Regular.woff2?v=20260731"

let homeFontPromise: Promise<void> | undefined

function ensureHomeFontLoaded(): Promise<void> {
  if (homeFontPromise) return homeFontPromise

  homeFontPromise = new Promise<void>((resolve, reject) => {
    wx.loadFontFace({
      family: HOME_FONT_FAMILY,
      source: `url("${HOME_FONT_URL}")`,
      desc: {
        style: "normal",
        weight: "normal"
      },
      global: true,
      scopes: ["webview", "native"],
      success: () => resolve(),
      fail: (error) => {
        homeFontPromise = undefined
        reject(error)
      }
    })
  })

  return homeFontPromise
}

Component({
  data: {
    featureGroups: [
      {
        key: "creation",
        title: "创作",
        items: [
          {
            key: "text-card",
            icon: "notebook-pen",
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
        title: "生活",
        items: [
          {
            key: "menu",
            icon: "cooking-pot",
            title: "饮食清单",
            path: "/pages/menu/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "media",
            icon: "clapperboard",
            title: "影视记录",
            path: "/pages/media/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "activities",
            icon: "sparkles",
            title: "活动清单",
            path: "/pages/activities/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "exercise",
            icon: "dumbbell",
            title: "运动养宠",
            path: "/exercise/pages/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "luggage",
            icon: "luggage",
            title: "行李清单",
            path: "/pages/luggage/index",
            available: true,
            requiresLogin: true
          },
          {
            key: "wardrobe",
            icon: "shirt",
            title: "我的衣橱",
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
      void ensureHomeFontLoaded().catch(() => undefined)
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

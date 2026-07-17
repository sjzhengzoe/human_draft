import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
}

Component({
  data: {
    featureItems: [
      {
        key: "xiaohongshu",
        icon: "notebook-pen-white",
        title: "小红书模板",
        desc: "生成图文卡片",
        path: "/pages/xiaohongshu/index",
        available: true,
        requiresLogin: false
      },
      {
        key: "douyin2",
        icon: "video-white",
        title: "抖音模板",
        desc: "生成短句卡片",
        path: "/pages/douyin2/index",
        available: true,
        requiresLogin: false
      },
      {
        key: "menu",
        icon: "cooking-pot-white",
        title: "我的菜单",
        desc: "管理日常菜品",
        path: "/pages/menu/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "media",
        icon: "clapperboard-white",
        title: "影视清单",
        desc: "记录观影进度",
        path: "/pages/media/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "activities",
        icon: "sparkles-white",
        title: "活动清单",
        desc: "收藏活动灵感",
        path: "/pages/activities/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "luggage",
        icon: "luggage-white",
        title: "行李清单",
        desc: "整理出行物品",
        path: "/pages/luggage/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "dining",
        icon: "utensils-crossed-white",
        title: "用餐清单",
        desc: "收藏用餐店铺",
        path: "/pages/dining/index",
        available: true,
        requiresLogin: true
      },
      {
        key: "wardrobe",
        icon: "shirt-white",
        title: "我的衣橱",
        desc: "记录衣物尺寸",
        path: "/pages/wardrobe/index",
        available: true,
        requiresLogin: true
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
      const { path, available, title, requiresLogin } = event.currentTarget.dataset
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

      wx.navigateTo({
        url: String(path)
      })
    }
  }
})

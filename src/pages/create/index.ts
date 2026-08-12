import { getCurrentUser } from "../../services/auth"
import { hideGlobalLoading } from "../../services/loading"
import {
  getHomeModulePath,
  getVisibleHomeFeatureGroups
} from "../../utils/home-modules"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
  navigationLocked?: boolean
  pendingLoginModuleKey?: string
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11) return "早上好"
  if (hour >= 11 && hour < 14) return "中午好"
  if (hour >= 14 && hour < 18) return "下午好"
  return "晚上好！"
}

function setCreateTabBarMasked(page: CreatePageInstance, masked: boolean) {
  const tabBar = page.getTabBar && page.getTabBar()
  if (tabBar) tabBar.setData({ masked })
}

function getItemKeySignature(items: Array<{ key?: string }>) {
  return items.map((item) => item.key || "").join("|")
}

function getGroupKeySignature(
  groups: Array<{ key?: string; items?: Array<{ key?: string }> }>
) {
  return groups
    .map((group) => `${group.key || ""}:${getItemKeySignature(group.items || [])}`)
    .join("|")
}

Component({
  data: {
    featureGroups: getVisibleHomeFeatureGroups(),
    greetingText: getTimeGreeting(),
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
      page.navigationLocked = false
      const tabBar = page.getTabBar && page.getTabBar()

      if (tabBar) {
        tabBar.setData({
          selected: 0,
          hidden: false,
          masked: false
        })
      }

      const nextFeatureGroups = getVisibleHomeFeatureGroups()
      const nextGreetingText = getTimeGreeting()
      const nextLoggedIn = Boolean(getCurrentUser())
      const updates: WechatMiniprogram.IAnyObject = {}

      if (
        getGroupKeySignature(nextFeatureGroups) !==
        getGroupKeySignature(this.data.featureGroups)
      ) {
        updates.featureGroups = nextFeatureGroups
      }
      if (nextGreetingText !== this.data.greetingText) {
        updates.greetingText = nextGreetingText
      }
      if (nextLoggedIn !== this.data.loggedIn) {
        updates.loggedIn = nextLoggedIn
      }
      if (Object.keys(updates).length > 0) this.setData(updates)

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
        const page = this as CreatePageInstance
        page.pendingLoginModuleKey = String(key)
        setCreateTabBarMasked(page, true)
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

      const page = this as CreatePageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true

      wx.navigateTo({
        url: nextPath,
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleLoginDialogCancel() {
      const page = this as CreatePageInstance
      page.pendingLoginModuleKey = ""
      setCreateTabBarMasked(page, false)
      this.setData({ loginDialogVisible: false })
    },
    handleLoginDialogConfirm() {
      const page = this as CreatePageInstance
      const moduleKey = page.pendingLoginModuleKey || ""
      page.pendingLoginModuleKey = ""
      setCreateTabBarMasked(page, false)
      this.setData({ loginDialogVisible: false })
      const query = getHomeModulePath(moduleKey)
        ? `?module=${encodeURIComponent(moduleKey)}`
        : ""
      wx.navigateTo({ url: `/pages/login/index${query}` })
    }
  }
})

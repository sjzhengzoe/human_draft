import { hideGlobalLoading } from "../../services/loading"
import { loadHomeModuleSettings } from "../../services/home-module-settings"
import {
  getVisibleHomeFeatureGroups
} from "../../utils/home-modules"
import { updateAppTabBarState } from "../../utils/tab-bar"

type CreatePageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  hasRendered?: boolean
  navigationLocked?: boolean
}

const TEXT_CARD_TEMPLATE_STORAGE_KEY = "TEXT_CARD_LAST_TEMPLATE"

function getTimeGreeting(date = new Date()) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 11) return "早上好"
  if (hour >= 11 && hour < 14) return "中午好"
  if (hour >= 14 && hour < 18) return "下午好"
  return "晚上好！"
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
    greetingText: getTimeGreeting()
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
      const settingsPromise = loadHomeModuleSettings()
      const tabBar = page.getTabBar && page.getTabBar()

      updateAppTabBarState(tabBar, {
        selected: 0,
        hidden: false,
        masked: false
      })

      const nextFeatureGroups = getVisibleHomeFeatureGroups()
      const nextGreetingText = getTimeGreeting()
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
      if (Object.keys(updates).length > 0) this.setData(updates)

      void settingsPromise
        .then(() => {
          const loadedFeatureGroups = getVisibleHomeFeatureGroups()
          if (
            getGroupKeySignature(loadedFeatureGroups) !==
            getGroupKeySignature(this.data.featureGroups)
          ) {
            this.setData({ featureGroups: loadedFeatureGroups })
          }
        })
        .catch(() => {
          // 首页保持默认模块即可，进入设置页时再展示明确的读取错误。
        })

      if (page.hasRendered) {
        wx.nextTick(() => hideGlobalLoading())
      }
    }
  },
  methods: {
    handleFeatureTap(event: WechatMiniprogram.TouchEvent) {
      const { key, path, available, title } = event.currentTarget.dataset
      const isAvailable = available === true || available === "true"

      if (!isAvailable || !path) {
        wx.showToast({
          title: `${title || "功能"}待迁移`,
          icon: "none"
        })
        return
      }

      const lastTemplate = wx.getStorageSync(TEXT_CARD_TEMPLATE_STORAGE_KEY)
      const nextPath =
        key === "text-card" &&
        (lastTemplate === "xiaohongshu" ||
          lastTemplate === "xiaohongshu4" ||
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
    }
  }
})

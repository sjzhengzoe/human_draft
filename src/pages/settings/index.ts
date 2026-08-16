import { getCurrentUser, logout } from "../../services/auth"
import { deleteCurrentAccount } from "../../services/account-deletion"
import {
  getCachedImageStorageUsage,
  getImageStorageUsage
} from "../../services/account"
import { UI_COLORS } from "../../styles/colors"
import { updateAppTabBarState } from "../../utils/tab-bar"

type SettingsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  navigationLocked?: boolean
  logoutPending?: boolean
  deleteAccountPending?: boolean
  failedAvatarSignature?: string
  storageUsageRequestId?: number
}

function formatStorageBytes(value: number): string {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function getStorageUsageState(usage: {
  used_bytes: number
  image_count: number
  quota_bytes: number
  remaining_bytes: number
  is_near_limit: boolean
}) {
  return {
    storageUsedText: formatStorageBytes(usage.used_bytes),
    storageRemainingText: formatStorageBytes(usage.remaining_bytes),
    storageImageCountText: `共 ${usage.image_count} 张图片`,
    storageQuotaText: formatStorageBytes(usage.quota_bytes),
    storageUsageNearLimit: usage.is_near_limit,
    storageUsageLoading: false
  }
}

function getSettingsAccountState(failedAvatarSignature = "") {
  const user = getCurrentUser()
  if (!user) {
    return {
      loggedIn: false,
      displayName: "游客",
      avatarUrl: "",
      avatarInitial: "E",
      uid: "",
      isAdmin: false,
      accessDisplayLabel: ""
    }
  }

  const avatarSignature = `${user.uid}|${user.avatar_url}`
  return {
    loggedIn: true,
    displayName: user.display_name,
    avatarUrl: avatarSignature === failedAvatarSignature ? "" : user.avatar_url,
    avatarInitial: user.display_name.trim().slice(0, 1) || "E",
    uid: user.uid,
    isAdmin: user.is_admin,
    accessDisplayLabel: user.access.display_label
  }
}

Component({
  data: {
    ...getSettingsAccountState(),
    storageUsedText: "正在统计…",
    storageRemainingText: "",
    storageImageCountText: "",
    storageQuotaText: "",
    storageUsageNearLimit: false,
    storageUsageLoading: false,
    storageInfoDialogVisible: false,
    deleteAccountDialogVisible: false,
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      const page = this as SettingsPageInstance
      page.navigationLocked = false
      const tabBar = page.getTabBar && page.getTabBar()
      updateAppTabBarState(tabBar, { selected: 1, hidden: false })

      const nextAccountState = getSettingsAccountState(page.failedAvatarSignature)
      const accountChanged =
        nextAccountState.loggedIn !== this.data.loggedIn ||
        nextAccountState.displayName !== this.data.displayName ||
        nextAccountState.avatarUrl !== this.data.avatarUrl ||
        nextAccountState.avatarInitial !== this.data.avatarInitial ||
        nextAccountState.uid !== this.data.uid ||
        nextAccountState.isAdmin !== this.data.isAdmin ||
        nextAccountState.accessDisplayLabel !== this.data.accessDisplayLabel
      if (accountChanged) this.setData(nextAccountState)
      if (nextAccountState.loggedIn) {
        const cachedUsage = getCachedImageStorageUsage()
        if (cachedUsage) this.setData(getStorageUsageState(cachedUsage))
        else void this.refreshStorageUsage()
      }
    }
  },
  methods: {
    handleAvatarError() {
      const user = getCurrentUser()
      if (!user || !this.data.avatarUrl) return
      const page = this as SettingsPageInstance
      page.failedAvatarSignature = `${user.uid}|${this.data.avatarUrl}`
      this.setData({ avatarUrl: "" })
    },
    handleEditProfileTap() {
      const user = getCurrentUser()
      const page = this as SettingsPageInstance
      if (!user || page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/profile-edit/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleLoginTap() {
      const page = this as SettingsPageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/login/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleLogoutTap() {
      const page = this as SettingsPageInstance
      if (page.logoutPending) return
      page.logoutPending = true
      wx.showModal({
        title: "退出登录",
        content: "退出后需要重新点击微信账号登录。",
        confirmText: "退出",
        confirmColor: UI_COLORS.actionPrimary,
        success: async (result) => {
          if (!result.confirm) {
            page.logoutPending = false
            return
          }
          wx.showLoading({ title: "正在退出" })
          try {
            await logout()
          } finally {
            wx.hideLoading()
            wx.switchTab({
              url: "/pages/create/index",
              fail: () => wx.showToast({ title: "暂时无法返回首页", icon: "none" }),
              complete: () => {
                page.logoutPending = false
              }
            })
          }
        },
        fail: () => {
          page.logoutPending = false
          wx.showToast({ title: "暂时无法退出，请重试", icon: "none" })
        }
      })
    },
    handleCopyUidTap() {
      const uid = String(this.data.uid || "")
      if (!uid) return
      wx.setClipboardData({
        data: uid,
        success: () => wx.showToast({ title: "UID 已复制", icon: "success" }),
        fail: () => wx.showToast({ title: "复制失败，请重试", icon: "none" })
      })
    },
    async refreshStorageUsage() {
      if (this.data.storageUsageLoading) return
      const page = this as SettingsPageInstance
      const requestId = (page.storageUsageRequestId || 0) + 1
      page.storageUsageRequestId = requestId
      this.setData({
        storageUsageLoading: true,
        storageUsedText: "正在统计…",
        storageRemainingText: "",
        storageImageCountText: "",
        storageQuotaText: ""
      })
      try {
        const usage = await getImageStorageUsage()
        if (page.storageUsageRequestId !== requestId) return
        this.setData(getStorageUsageState(usage))
      } catch (_error) {
        if (page.storageUsageRequestId !== requestId) return
        this.setData({
          storageUsedText: "暂时无法读取",
          storageRemainingText: "",
          storageImageCountText: "稍后重新进入页面即可重试",
          storageQuotaText: "",
          storageUsageNearLimit: false,
          storageUsageLoading: false
        })
      }
    },
    handleStorageInfoTap() {
      this.setData({ storageInfoDialogVisible: true })
    },
    handleStorageInfoClose() {
      this.setData({ storageInfoDialogVisible: false })
    },
    handleModuleSettingsTap() {
      const page = this as SettingsPageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/home-modules/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleAboutTap() {
      const page = this as SettingsPageInstance
      if (page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/about/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleDeleteAccountTap() {
      const page = this as SettingsPageInstance
      if (!this.data.loggedIn || page.deleteAccountPending) return
      this.setData({ deleteAccountDialogVisible: true })
    },
    handleDeleteAccountCancel() {
      const page = this as SettingsPageInstance
      if (page.deleteAccountPending) return
      this.setData({ deleteAccountDialogVisible: false })
    },
    async handleDeleteAccountConfirm() {
      const page = this as SettingsPageInstance
      if (page.deleteAccountPending) return
      page.deleteAccountPending = true
      wx.showLoading({ title: "正在注销", mask: true })
      try {
        await deleteCurrentAccount()
        this.setData({ deleteAccountDialogVisible: false })
        wx.reLaunch({
          url: "/pages/create/index",
          fail: () => wx.showToast({ title: "账号已注销，请重新打开小程序", icon: "none" })
        })
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "注销失败，请稍后重试",
          icon: "none"
        })
      } finally {
        wx.hideLoading()
        page.deleteAccountPending = false
      }
    },
    handleRuntimeControlsTap() {
      const page = this as SettingsPageInstance
      if (!this.data.isAdmin || page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/runtime-controls/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    },
    handleAnalyticsTap() {
      const page = this as SettingsPageInstance
      if (!this.data.isAdmin || page.navigationLocked) return
      page.navigationLocked = true
      wx.navigateTo({
        url: "/pages/settings/analytics/index",
        fail: () => {
          page.navigationLocked = false
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        }
      })
    }
  }
})

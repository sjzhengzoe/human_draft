import { getCurrentUser, logout } from "../../services/auth"
import { updateAccountAvatar, updateAccountProfile } from "../../services/profile"
import { UI_COLORS } from "../../styles/colors"
import { updateAppTabBarState } from "../../utils/tab-bar"

type SettingsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  getTabBar?: () => WechatMiniprogram.Component.TrivialInstance
  navigationLocked?: boolean
  logoutPending?: boolean
  failedAvatarSignature?: string
}


function profileInitial(value: string) {
  return value.trim().slice(0, 1) || "E"
}

function getSettingsAccountState(failedAvatarSignature = "") {
  const user = getCurrentUser()
  if (!user) {
    return {
      loggedIn: false,
      displayName: "未登录",
      avatarUrl: "",
      avatarInitial: "E",
      isAdmin: false
    }
  }

  const avatarSignature = `${user.id}|${user.avatar_url}`
  return {
    loggedIn: true,
    displayName: user.display_name,
    avatarUrl: avatarSignature === failedAvatarSignature ? "" : user.avatar_url,
    avatarInitial: user.display_name.trim().slice(0, 1) || "E",
    isAdmin: user.is_admin
  }
}

Component({
  data: {
    ...getSettingsAccountState(),
    showProfileDialog: false,
    editingDisplayName: "",
    editingAvatarUrl: "",
    editingAvatarInitial: "E",
    pendingAvatarPath: "",
    selectingProfileAvatar: false,
    showImageCropper: false,
    cropSourcePath: "",
    savingProfile: false,
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
        nextAccountState.isAdmin !== this.data.isAdmin
      if (accountChanged) this.setData(nextAccountState)
    }
  },
  methods: {
    handleAvatarError() {
      const user = getCurrentUser()
      if (!user || !this.data.avatarUrl) return
      const page = this as SettingsPageInstance
      page.failedAvatarSignature = `${user.id}|${this.data.avatarUrl}`
      this.setData({ avatarUrl: "" })
    },
    handleEditProfileTap() {
      const user = getCurrentUser()
      if (!user || this.data.savingProfile) return
      this.setData({
        showProfileDialog: true,
        editingDisplayName: user.display_name,
        editingAvatarUrl: user.avatar_url,
        editingAvatarInitial: profileInitial(user.display_name),
        pendingAvatarPath: "",
        selectingProfileAvatar: false
      })
    },
    handleProfileDialogCancel() {
      if (this.data.savingProfile || this.data.selectingProfileAvatar) return
      this.setData({
        showProfileDialog: false,
        editingDisplayName: "",
        editingAvatarUrl: "",
        pendingAvatarPath: ""
      })
    },
    handleDisplayNameInput(event: WechatMiniprogram.Input) {
      const editingDisplayName = event.detail.value
      this.setData({
        editingDisplayName,
        editingAvatarInitial: profileInitial(editingDisplayName)
      })
    },
    handleChooseProfileAvatar() {
      if (
        this.data.savingProfile ||
        this.data.selectingProfileAvatar ||
        this.data.showImageCropper
      ) return
      this.setData({ selectingProfileAvatar: true })
      wx.chooseMedia({
        count: 1,
        mediaType: ["image"],
        sourceType: ["album", "camera"],
        success: (result) => {
          const path = result.tempFiles[0]?.tempFilePath
          if (!path) {
            this.setData({ selectingProfileAvatar: false })
            return
          }
          this.setData({
            selectingProfileAvatar: false,
            showImageCropper: true,
            cropSourcePath: path
          })
        },
        fail: () => this.setData({ selectingProfileAvatar: false })
      })
    },
    handleAvatarCropCancel() {
      this.setData({ showImageCropper: false, cropSourcePath: "" })
    },
    handleAvatarCropConfirm(
      event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>
    ) {
      const path = event.detail.tempFilePath
      if (!path) return
      this.setData({
        editingAvatarUrl: path,
        pendingAvatarPath: path,
        showImageCropper: false,
        cropSourcePath: ""
      })
    },
    handleAvatarCropError(
      event: WechatMiniprogram.CustomEvent<{ message?: string }>
    ) {
      wx.showToast({
        title: event.detail.message || "头像裁剪失败，请重试",
        icon: "none"
      })
    },
    async handleProfileSave() {
      if (this.data.savingProfile) return
      const user = getCurrentUser()
      if (!user) return
      const displayName = String(this.data.editingDisplayName || "").trim()
      if (!displayName) {
        wx.showToast({ title: "请填写昵称", icon: "none" })
        return
      }
      if (Array.from(displayName).length > 40) {
        wx.showToast({ title: "昵称不能超过 40 个字符", icon: "none" })
        return
      }

      const displayNameChanged = displayName !== user.display_name
      const pendingAvatarPath = String(this.data.pendingAvatarPath || "")
      if (!displayNameChanged && !pendingAvatarPath) {
        this.handleProfileDialogCancel()
        return
      }

      this.setData({ savingProfile: true })
      try {
        if (displayNameChanged) await updateAccountProfile(displayName)
        if (pendingAvatarPath) await updateAccountAvatar(pendingAvatarPath)
        const page = this as SettingsPageInstance
        page.failedAvatarSignature = ""
        const nextAccountState = getSettingsAccountState()
        this.setData({
          ...nextAccountState,
          showProfileDialog: false,
          editingDisplayName: "",
          editingAvatarUrl: "",
          pendingAvatarPath: ""
        })
        wx.showToast({ title: "个人资料已更新", icon: "success" })
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败，请重试",
          icon: "none",
          duration: 3000
        })
      } finally {
        this.setData({ savingProfile: false })
      }
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
    }
  }
})

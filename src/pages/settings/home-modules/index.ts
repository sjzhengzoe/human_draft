import { UI_COLORS } from "../../../styles/colors"
import { getCurrentUser } from "../../../services/auth"
import {
  loadHomeModuleSettings,
  resetHomeModuleSettings,
  saveHomeModuleSettings
} from "../../../services/home-module-settings"
import {
  applyHiddenHomeModuleKeys,
  getHiddenHomeModuleKeys,
  getHomeModuleSettingGroups,
  setHomeModuleVisible
} from "../../../utils/home-modules"
import { requireLoginForAction } from "../../../utils/login-required"

Component({
  data: {
    moduleGroups: getHomeModuleSettingGroups(),
    settingsLoading: false,
    settingsSaving: false,
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      if (!getCurrentUser()) {
        resetHomeModuleSettings()
        this.refreshModuleSettings()
        return
      }
      void this.loadModuleSettings()
    }
  },
  methods: {
    refreshModuleSettings() {
      this.setData({
        moduleGroups: getHomeModuleSettingGroups()
      })
    },
    async loadModuleSettings() {
      if (this.data.settingsLoading) return
      this.setData({ settingsLoading: true })
      try {
        await loadHomeModuleSettings()
        this.refreshModuleSettings()
      } catch (_error) {
        wx.showToast({ title: "暂时无法读取首页设置", icon: "none" })
      } finally {
        this.setData({ settingsLoading: false })
      }
    },
    async handleModuleVisibleChange(
      event: WechatMiniprogram.SwitchChange<WechatMiniprogram.IAnyObject, { key?: string }>
    ) {
      const key = String(event.currentTarget.dataset.key || "")
      if (!key) return
      if (this.data.settingsLoading || this.data.settingsSaving) {
        this.refreshModuleSettings()
        return
      }
      if (!requireLoginForAction(this)) {
        this.refreshModuleSettings()
        return
      }

      const previousHiddenKeys = getHiddenHomeModuleKeys()
      const updated = setHomeModuleVisible(key, event.detail.value)
      if (!updated) {
        wx.showToast({
          title: "至少保留一个首页模块",
          icon: "none"
        })
        this.refreshModuleSettings()
        return
      }

      this.setData({ settingsSaving: true })
      this.refreshModuleSettings()
      try {
        await saveHomeModuleSettings()
      } catch (_error) {
        applyHiddenHomeModuleKeys(previousHiddenKeys)
        wx.showToast({ title: "保存失败，请重试", icon: "none" })
      } finally {
        this.setData({ settingsSaving: false })
        this.refreshModuleSettings()
      }
    }
  }
})

import { UI_COLORS } from "../../../styles/colors"
import {
  getHomeModuleSettingGroups,
  setHomeModuleVisible
} from "../../../utils/home-modules"

Component({
  data: {
    moduleGroups: getHomeModuleSettingGroups(),
    themeColors: UI_COLORS
  },
  pageLifetimes: {
    show() {
      this.refreshModuleSettings()
    }
  },
  methods: {
    refreshModuleSettings() {
      this.setData({
        moduleGroups: getHomeModuleSettingGroups()
      })
    },
    handleModuleVisibleChange(
      event: WechatMiniprogram.SwitchChange<WechatMiniprogram.IAnyObject, { key?: string }>
    ) {
      const key = String(event.currentTarget.dataset.key || "")
      if (!key) return
      const updated = setHomeModuleVisible(key, event.detail.value)
      if (!updated) {
        wx.showToast({
          title: "至少保留一个首页模块",
          icon: "none"
        })
      }
      this.refreshModuleSettings()
    }
  }
})

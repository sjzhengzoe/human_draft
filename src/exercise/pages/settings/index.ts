import {
  getExerciseDashboard,
  resetExerciseState,
  saveExerciseSettings
} from "../../services/exercise"
import { getCurrentUser } from "../../../services/auth"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"
import { requireLoginForAction } from "../../../utils/login-required"

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength)
}

Page({
  data: {
    loading: true,
    saving: false,
    resetting: false,
    dailyMinutes: "30",
    monthlyRestDays: "4",
    dailyMinutesDraft: "",
    monthlyRestDaysDraft: "",
    settingsEditorVisible: false,
    resetConfirmVisible: false
  },

  onLoad() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.setData({ loading: false })
      return
    }
    this.loadSettings()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadSettings() {
    if (!getCurrentUser()) return
    try {
      const dashboard = await getExerciseDashboard()
      if (!isAsyncPageActive(this)) return
      this.setData({
        dailyMinutes: String(dashboard.profile.daily_minutes),
        monthlyRestDays: String(dashboard.profile.monthly_rest_days)
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ loading: false })
    }
  },

  handleDailyInput(event: WechatMiniprogram.Input) {
    const dailyMinutesDraft = digitsOnly(event.detail.value, 3)
    this.setData({ dailyMinutesDraft })
    return dailyMinutesDraft
  },

  handleRestInput(event: WechatMiniprogram.Input) {
    const monthlyRestDaysDraft = digitsOnly(event.detail.value, 2)
    this.setData({ monthlyRestDaysDraft })
    return monthlyRestDaysDraft
  },

  handleOpenSettingsEditor() {
    if (!requireLoginForAction(this)) return
    if (this.data.saving || this.data.resetting) return
    this.setData({
      dailyMinutesDraft: this.data.dailyMinutes,
      monthlyRestDaysDraft: this.data.monthlyRestDays,
      settingsEditorVisible: true
    })
  },

  handleSettingsEditorCancel() {
    if (this.data.saving) return
    this.setData({
      dailyMinutesDraft: "",
      monthlyRestDaysDraft: "",
      settingsEditorVisible: false
    })
  },

  async handleSave() {
    if (!requireLoginForAction(this)) return
    if (this.data.saving || this.data.resetting) return
    const dailyMinutes = Number(this.data.dailyMinutesDraft)
    const monthlyRestDays = Number(this.data.monthlyRestDaysDraft)
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 300) {
      wx.showToast({ title: "每日分钟数需为 1–300", icon: "none" })
      return
    }
    if (!Number.isInteger(monthlyRestDays) || monthlyRestDays < 0 || monthlyRestDays > 28) {
      wx.showToast({ title: "休息天数需为 0–28", icon: "none" })
      return
    }
    this.setData({ saving: true })
    try {
      await saveExerciseSettings({
        daily_minutes: dailyMinutes,
        monthly_rest_days: monthlyRestDays
      })
      if (!isAsyncPageActive(this)) return
      this.setData({
        dailyMinutes: String(dailyMinutes),
        monthlyRestDays: String(monthlyRestDays),
        dailyMinutesDraft: "",
        monthlyRestDaysDraft: "",
        settingsEditorVisible: false
      })
      wx.showToast({ title: "已保存：目标明天生效，额度下月生效", icon: "none" })
      setTimeout(() => {
        if (isAsyncPageActive(this)) wx.navigateBack()
      }, 450)
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleReset() {
    if (!requireLoginForAction(this)) return
    if (this.data.saving || this.data.resetting) return
    this.setData({ resetConfirmVisible: true })
  },

  handleResetCancel() {
    if (this.data.resetting) return
    this.setData({ resetConfirmVisible: false })
  },

  handleResetConfirm() {
    if (this.data.resetting) return
    this.setData({ resetConfirmVisible: false })
    this.performReset()
  },

  async performReset() {
    if (!requireLoginForAction(this)) return
    this.setData({ resetting: true })
    try {
      await resetExerciseState()
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "运动历史已清空", icon: "success" })
      setTimeout(() => {
        if (isAsyncPageActive(this)) wx.navigateBack()
      }, 450)
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "重置失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ resetting: false })
    }
  }
})

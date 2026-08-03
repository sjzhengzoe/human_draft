import {
  getExerciseDashboard,
  resetExerciseState,
  saveExerciseSettings
} from "../../services/exercise"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"

Page({
  data: {
    loading: true,
    saving: false,
    resetting: false,
    dailyMinutes: "30",
    monthlyRestDays: "4",
    restDaysUsed: 0,
    resetConfirmVisible: false
  },

  onLoad() {
    activateAsyncPage(this)
    this.loadSettings()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadSettings() {
    try {
      const dashboard = await getExerciseDashboard()
      if (!isAsyncPageActive(this)) return
      this.setData({
        dailyMinutes: String(dashboard.profile.daily_minutes),
        monthlyRestDays: String(dashboard.profile.monthly_rest_days),
        restDaysUsed: dashboard.rest_days.used
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
    this.setData({ dailyMinutes: event.detail.value })
  },

  handleRestInput(event: WechatMiniprogram.Input) {
    this.setData({ monthlyRestDays: event.detail.value })
  },

  async handleSave() {
    if (this.data.saving || this.data.resetting) return
    const dailyMinutes = Number(this.data.dailyMinutes)
    const monthlyRestDays = Number(this.data.monthlyRestDays)
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 1 || dailyMinutes > 300) {
      wx.showToast({ title: "每日分钟数需为 1–300", icon: "none" })
      return
    }
    if (!Number.isInteger(monthlyRestDays) || monthlyRestDays < 0 || monthlyRestDays > 28) {
      wx.showToast({ title: "休息天数需为 0–28", icon: "none" })
      return
    }
    if (monthlyRestDays < this.data.restDaysUsed) {
      wx.showToast({
        title: `不能少于本月已使用的 ${this.data.restDaysUsed} 天`,
        icon: "none"
      })
      return
    }

    this.setData({ saving: true })
    try {
      await saveExerciseSettings({
        daily_minutes: dailyMinutes,
        monthly_rest_days: monthlyRestDays
      })
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "已保存，每日目标明天生效", icon: "none" })
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

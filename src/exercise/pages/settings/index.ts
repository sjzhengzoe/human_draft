import {
  getExerciseDashboard,
  resetExerciseState,
  saveExerciseSettings
} from "../../services/exercise"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"

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
    const dailyMinutes = digitsOnly(event.detail.value, 3)
    this.setData({ dailyMinutes })
    return dailyMinutes
  },

  handleRestInput(event: WechatMiniprogram.Input) {
    const monthlyRestDays = digitsOnly(event.detail.value, 2)
    this.setData({ monthlyRestDays })
    return monthlyRestDays
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
    this.setData({ saving: true })
    try {
      await saveExerciseSettings({
        daily_minutes: dailyMinutes,
        monthly_rest_days: monthlyRestDays
      })
      if (!isAsyncPageActive(this)) return
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

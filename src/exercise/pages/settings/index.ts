import {
  getExerciseDashboard,
  resetExerciseState,
  saveExerciseSettings
} from "../../../services/exercise"
import { activateAsyncPage, deactivateAsyncPage, isAsyncPageActive } from "../../../utils/async-page"

Page({
  data: {
    loading: true,
    saving: false,
    resetting: false,
    dailyMinutes: "30",
    monthlyRestDays: "4",
    previewMinutes: 0,
    calendarDays: 0,
    exerciseDays: 0,
    restDays: 0,
    daysInMonth: 31
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
        previewMinutes: dashboard.claim_preview.minutes,
        calendarDays: dashboard.claim_preview.calendar_days,
        exerciseDays: dashboard.claim_preview.exercise_days,
        restDays: dashboard.claim_preview.rest_days,
        daysInMonth: new Date(
          Number(dashboard.month.month_start.slice(0, 4)),
          Number(dashboard.month.month_start.slice(5, 7)),
          0
        ).getDate()
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
    this.setData({ dailyMinutes: event.detail.value }, () => this.updatePreview())
  },

  handleRestInput(event: WechatMiniprogram.Input) {
    this.setData({ monthlyRestDays: event.detail.value }, () => this.updatePreview())
  },

  updatePreview() {
    const dailyMinutes = Number(this.data.dailyMinutes)
    const monthlyRestDays = Number(this.data.monthlyRestDays)
    if (!Number.isFinite(dailyMinutes) || !Number.isFinite(monthlyRestDays)) return
    const restDays = Math.min(
      this.data.calendarDays,
      Math.round(monthlyRestDays * this.data.calendarDays / this.data.daysInMonth)
    )
    const exerciseDays = Math.max(0, this.data.calendarDays - restDays)
    this.setData({
      restDays,
      exerciseDays,
      previewMinutes: Math.max(0, exerciseDays * dailyMinutes)
    })
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
      wx.showToast({ title: "设置已保存", icon: "success" })
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
    wx.showModal({
      title: "重置运动状态",
      content: "将清空全部任务、完成记录和跨月余额。每日运动分钟数与每月休息天数会保留，本月可以重新领取任务。",
      confirmText: "确认重置",
      confirmColor: "#111111",
      success: (result) => {
        if (result.confirm) this.performReset()
      }
    })
  },

  async performReset() {
    this.setData({ resetting: true })
    try {
      await resetExerciseState()
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "状态已重置", icon: "success" })
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

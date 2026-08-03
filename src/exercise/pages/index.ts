import {
  completeExercise,
  consumeExerciseRestDay,
  getExerciseDashboard
} from "../services/exercise"
import type { ExerciseBowlLevel, ExerciseDashboard } from "../../types/exercise"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

const PET_IMAGES: Record<ExerciseBowlLevel, readonly string[]> = {
  full: [
    "https://gufeifei.cn/exercise/assets/pets/happy/01.png",
    "https://gufeifei.cn/exercise/assets/pets/happy/02.png",
    "https://gufeifei.cn/exercise/assets/pets/happy/03.png",
    "https://gufeifei.cn/exercise/assets/pets/happy/04.png",
    "https://gufeifei.cn/exercise/assets/pets/happy/05.png"
  ],
  normal: [
    "https://gufeifei.cn/exercise/assets/pets/normal/01.png",
    "https://gufeifei.cn/exercise/assets/pets/normal/02.png",
    "https://gufeifei.cn/exercise/assets/pets/normal/03.png",
    "https://gufeifei.cn/exercise/assets/pets/normal/04.png",
    "https://gufeifei.cn/exercise/assets/pets/normal/05.png"
  ],
  low: [
    "https://gufeifei.cn/exercise/assets/pets/unhappy/01.png",
    "https://gufeifei.cn/exercise/assets/pets/unhappy/02.png",
    "https://gufeifei.cn/exercise/assets/pets/unhappy/03.png",
    "https://gufeifei.cn/exercise/assets/pets/unhappy/04.png",
    "https://gufeifei.cn/exercise/assets/pets/unhappy/05.png"
  ],
  empty: [
    "https://gufeifei.cn/exercise/assets/pets/pitiful/01.png",
    "https://gufeifei.cn/exercise/assets/pets/pitiful/02.png",
    "https://gufeifei.cn/exercise/assets/pets/pitiful/03.png",
    "https://gufeifei.cn/exercise/assets/pets/pitiful/04.png",
    "https://gufeifei.cn/exercise/assets/pets/pitiful/05.png"
  ]
}

const BOWL_IMAGES: Record<ExerciseBowlLevel, readonly string[]> = {
  full: [
    "https://gufeifei.cn/exercise/assets/bowls/happy/01.png",
    "https://gufeifei.cn/exercise/assets/bowls/happy/02.png",
    "https://gufeifei.cn/exercise/assets/bowls/happy/03.png",
    "https://gufeifei.cn/exercise/assets/bowls/happy/04.png",
    "https://gufeifei.cn/exercise/assets/bowls/happy/05.png"
  ],
  normal: [
    "https://gufeifei.cn/exercise/assets/bowls/normal/01.png",
    "https://gufeifei.cn/exercise/assets/bowls/normal/02.png",
    "https://gufeifei.cn/exercise/assets/bowls/normal/03.png",
    "https://gufeifei.cn/exercise/assets/bowls/normal/04.png",
    "https://gufeifei.cn/exercise/assets/bowls/normal/05.png"
  ],
  low: [
    "https://gufeifei.cn/exercise/assets/bowls/unhappy/01.png",
    "https://gufeifei.cn/exercise/assets/bowls/unhappy/02.png",
    "https://gufeifei.cn/exercise/assets/bowls/unhappy/03.png",
    "https://gufeifei.cn/exercise/assets/bowls/unhappy/04.png",
    "https://gufeifei.cn/exercise/assets/bowls/unhappy/05.png"
  ],
  empty: [
    "https://gufeifei.cn/exercise/assets/bowls/pitiful/01.png",
    "https://gufeifei.cn/exercise/assets/bowls/pitiful/02.png",
    "https://gufeifei.cn/exercise/assets/bowls/pitiful/03.png",
    "https://gufeifei.cn/exercise/assets/bowls/pitiful/04.png",
    "https://gufeifei.cn/exercise/assets/bowls/pitiful/05.png"
  ]
}

const PET_STATE_LABELS: Record<ExerciseBowlLevel, string> = {
  full: "高兴",
  normal: "一般",
  low: "不高兴",
  empty: "可可怜怜"
}

const CALENDAR_CAT_IMAGE = "/exercise/assets/calendar/happy-cat.png"
const CALENDAR_DOG_IMAGE = "/exercise/assets/calendar/unhappy-dog.png"

type ExerciseCalendarCell = {
  key: string
  day: number | string
  state: string
  isToday: boolean
  canUseRestDay: boolean
  restUsed: boolean
}

function restDayButtonState(cell: ExerciseCalendarCell, remaining: number) {
  if (cell.restUsed) {
    return { disabled: true, text: "已设为休息日" }
  }
  if (!cell.canUseRestDay) {
    return { disabled: true, text: "日常任务已完成" }
  }
  if (remaining === 0) {
    return { disabled: true, text: "休息日权限已用完" }
  }
  return { disabled: false, text: "使用休息日权限" }
}

function pickRandomImage(images: readonly string[], currentImage = "") {
  const candidates = images.length > 1
    ? images.filter((image) => image !== currentImage)
    : images
  return candidates[Math.floor(Math.random() * candidates.length)]
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    busy: false,
    busyAction: "",
    todayPendingMinutes: 0,
    todayDailyTaskState: "pending",
    todayPendingTotal: 0,
    todayOverachievedMinutes: 0,
    restDaysUsed: 0,
    restDaysTotal: 0,
    restDaysRemaining: 0,
    restDayUsedToday: false,
    restDayButtonText: "使用休息日权限",
    restDayDisabled: true,
    selectedRestDate: "",
    selectedRestDayLabel: "今天",
    restConfirmVisible: false,
    restConfirmContent: "",
    completeButtonText: "完成运动",
    bowlLabel: "没有",
    emotionLabel: PET_STATE_LABELS.empty,
    petImage: PET_IMAGES.empty[0],
    bowlImage: BOWL_IMAGES.empty[0],
    calendarCatImage: CALENDAR_CAT_IMAGE,
    calendarDogImage: CALENDAR_DOG_IMAGE,
    calendarMonthLabel: "本月",
    calendarCells: [] as ExerciseCalendarCell[],
    minutesDialogVisible: false,
    minutesDialogTitle: "",
    minutesDialogPlaceholder: "",
    minutesInput: ""
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    activateAsyncPage(this)
    this.loadDashboard()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  applyDashboard(dashboard: ExerciseDashboard) {
    const bowlLevel = dashboard.cat.bowl_level
    const restDays = dashboard.rest_days
    const dailyPendingMinutes = dashboard.today.daily_pending_minutes
    const pendingTotal = dailyPendingMinutes
    const preferredRestDate = this.data.selectedRestDate || dashboard.today.date
    const selectedDay = dashboard.month.days.find((item) => item.date === preferredRestDate)
      || dashboard.month.days.find((item) => item.date === dashboard.today.date)
      || dashboard.month.days[0]
    const selectedRestDate = selectedDay.date
    const selectedRestDayLabel = `${dashboard.month.month}月${selectedDay.day}日`
    const calendarCells: ExerciseCalendarCell[] = [
      ...Array.from({ length: dashboard.month.first_weekday }, (_, index) => ({
        key: `blank-${index}`,
        day: "",
        state: "blank",
        isToday: false,
        canUseRestDay: false,
        restUsed: false
      })),
      ...dashboard.month.days.map((item) => ({
        key: item.date,
        day: item.day,
        state: item.state,
        isToday: item.date === dashboard.today.date,
        canUseRestDay: item.can_use_rest_day,
        restUsed: item.rest_used
      }))
    ]
    const restButton = restDayButtonState(
      calendarCells.find((item) => item.key === selectedRestDate)!,
      restDays.remaining
    )
    this.setData({
      todayPendingMinutes: dailyPendingMinutes,
      todayDailyTaskState: restDays.used_today
        ? "rest"
        : dailyPendingMinutes === 0 ? "completed" : "pending",
      todayPendingTotal: pendingTotal,
      todayOverachievedMinutes: dashboard.today.overachieved_minutes,
      restDaysUsed: restDays.used,
      restDaysTotal: restDays.total,
      restDaysRemaining: restDays.remaining,
      restDayUsedToday: restDays.used_today,
      restDayButtonText: restButton.text,
      restDayDisabled: restButton.disabled,
      selectedRestDate,
      selectedRestDayLabel,
      completeButtonText: pendingTotal === 0 ? "记录额外运动" : "完成运动",
      bowlLabel: dashboard.cat.bowl_label,
      emotionLabel: PET_STATE_LABELS[bowlLevel],
      petImage: pickRandomImage(PET_IMAGES[bowlLevel], this.data.petImage),
      bowlImage: pickRandomImage(BOWL_IMAGES[bowlLevel], this.data.bowlImage),
      calendarMonthLabel: `${dashboard.month.month}月`,
      calendarCells
    })
  },

  async loadDashboard() {
    const generation = beginAsyncPageRequest(this)
    if (!this.data.hasLoaded) this.setData({ loading: true })
    try {
      const dashboard = await getExerciseDashboard()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyDashboard(dashboard)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "加载失败",
        icon: "none"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, hasLoaded: true })
      }
    }
  },

  handleSettings() {
    if (this.data.busy) return
    wx.navigateTo({ url: "/exercise/pages/settings/index" })
  },

  handleCalendarDayTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy) return
    const date = String(event.currentTarget.dataset.date || "")
    const cell = this.data.calendarCells.find((item) => item.key === date)
    if (!cell || cell.state === "blank") return
    if (cell.state === "future") {
      wx.showToast({ title: "不能提前使用休息日", icon: "none" })
      return
    }
    if (cell.state === "untracked") {
      wx.showToast({ title: "该日期还没有开始记录", icon: "none" })
      return
    }
    const restButton = restDayButtonState(cell, this.data.restDaysRemaining)
    this.setData({
      selectedRestDate: date,
      selectedRestDayLabel: `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`,
      restDayButtonText: restButton.text,
      restDayDisabled: restButton.disabled
    })
  },

  handleRestDay() {
    if (this.data.restDayDisabled || this.data.busy) return
    const remainingAfterUse = Math.max(0, this.data.restDaysRemaining - 1)
    this.setData({
      restConfirmVisible: true,
      restConfirmContent: `使用后将把${this.data.selectedRestDayLabel}的日常任务标记为完成。使用后本月还剩 ${remainingAfterUse} 天休息权限。`
    })
  },

  handleRestCancel() {
    if (this.data.busy) return
    this.setData({ restConfirmVisible: false })
  },

  handleRestConfirm() {
    if (this.data.busy) return
    this.setData({ restConfirmVisible: false })
    this.runAction(
      "rest-day",
      () => consumeExerciseRestDay(this.data.selectedRestDate),
      (dashboard) => `${this.data.selectedRestDayLabel}已设为休息日，还剩 ${dashboard.rest_days.remaining} 天`
    )
  },

  handleComplete() {
    if (this.data.busy) return
    this.setData({
      minutesDialogVisible: true,
      minutesDialogTitle: "记录运动分钟",
      minutesDialogPlaceholder: this.data.todayPendingTotal > 0
        ? `今日还需 ${this.data.todayPendingTotal} 分钟，可继续记录超额`
        : "输入额外运动分钟数",
      minutesInput: this.data.todayPendingTotal > 0 ? String(this.data.todayPendingTotal) : ""
    })
  },

  handleMinutesInput(event: WechatMiniprogram.Input) {
    const minutesInput = event.detail.value.replace(/\D/g, "").slice(0, 5)
    this.setData({ minutesInput })
    return minutesInput
  },

  closeMinutesDialog() {
    if (this.data.busy) return
    this.setData({ minutesDialogVisible: false, minutesInput: "" })
  },

  confirmMinutesDialog() {
    if (this.data.busy) return
    const minutes = Number(String(this.data.minutesInput || "").trim())
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 10000) {
      wx.showToast({ title: "请输入 1–10000 的整数", icon: "none" })
      return
    }
    this.setData({ minutesDialogVisible: false, minutesInput: "" })
    this.runAction("complete", () => completeExercise(minutes), `已记录 ${minutes} 分钟`)
  },

  async runAction(
    action: string,
    request: () => Promise<ExerciseDashboard>,
    successMessage: string | ((dashboard: ExerciseDashboard) => string)
  ) {
    if (this.data.busy) return
    this.setData({ busy: true, busyAction: action })
    try {
      const dashboard = await request()
      if (!isAsyncPageActive(this)) return
      this.applyDashboard(dashboard)
      const resolvedMessage = typeof successMessage === "function"
        ? successMessage(dashboard)
        : successMessage
      wx.showToast({
        title: resolvedMessage,
        icon: resolvedMessage.length > 7 ? "none" : "success"
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "操作失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ busy: false, busyAction: "" })
    }
  }
})

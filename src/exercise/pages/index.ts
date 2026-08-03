import {
  claimExerciseExtra,
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
    todayExtraMinutes: 0,
    todayExtraPendingMinutes: 0,
    todayExtraTaskState: "none",
    todayPendingTotal: 0,
    todayOverachievedMinutes: 0,
    restDaysUsed: 0,
    restDaysTotal: 0,
    restDaysRemaining: 0,
    restDayUsedToday: false,
    restDayButtonText: "使用休息日权限",
    restDayDisabled: true,
    restConfirmVisible: false,
    restConfirmContent: "",
    completeButtonText: "完成运动",
    bowlLabel: "没有",
    emotionLabel: PET_STATE_LABELS.empty,
    petImage: PET_IMAGES.empty[0],
    bowlImage: BOWL_IMAGES.empty[0],
    minutesDialogVisible: false,
    minutesDialogMode: "",
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

  onPullDownRefresh() {
    this.loadDashboard().finally(() => wx.stopPullDownRefresh())
  },

  applyDashboard(dashboard: ExerciseDashboard) {
    const bowlLevel = dashboard.cat.bowl_level
    const restDays = dashboard.rest_days
    const dailyPendingMinutes = dashboard.today.daily_pending_minutes
    const extraMinutes = dashboard.today.extra_minutes
    const extraPendingMinutes = dashboard.today.extra_pending_minutes
    const pendingTotal = dailyPendingMinutes + extraPendingMinutes
    let restDayButtonText = `使用休息日权限 · 剩余 ${restDays.remaining} 天`
    if (restDays.used_today) {
      restDayButtonText = "今日已使用休息日权限"
    } else if (dailyPendingMinutes === 0) {
      restDayButtonText = "今日日常任务已完成"
    } else if (restDays.remaining === 0) {
      restDayButtonText = "休息日权限已用完"
    }
    this.setData({
      todayPendingMinutes: dailyPendingMinutes,
      todayDailyTaskState: restDays.used_today
        ? "rest"
        : dailyPendingMinutes === 0 ? "completed" : "pending",
      todayExtraMinutes: extraMinutes,
      todayExtraPendingMinutes: extraPendingMinutes,
      todayExtraTaskState: extraMinutes === 0
        ? "none"
        : extraPendingMinutes === 0 ? "completed" : "pending",
      todayPendingTotal: pendingTotal,
      todayOverachievedMinutes: dashboard.today.overachieved_minutes,
      restDaysUsed: restDays.used,
      restDaysTotal: restDays.total,
      restDaysRemaining: restDays.remaining,
      restDayUsedToday: restDays.used_today,
      restDayButtonText,
      restDayDisabled: restDays.remaining === 0
        || restDays.used_today
        || dailyPendingMinutes === 0,
      completeButtonText: pendingTotal === 0 ? "记录额外运动" : "完成运动",
      bowlLabel: dashboard.cat.bowl_label,
      emotionLabel: PET_STATE_LABELS[bowlLevel],
      petImage: pickRandomImage(PET_IMAGES[bowlLevel], this.data.petImage),
      bowlImage: pickRandomImage(BOWL_IMAGES[bowlLevel], this.data.bowlImage)
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

  handleRestDay() {
    if (this.data.restDayDisabled || this.data.busy) return
    const remainingAfterUse = Math.max(0, this.data.restDaysRemaining - 1)
    const extraText = this.data.todayExtraPendingMinutes > 0
      ? `今日加餐任务仍需完成 ${this.data.todayExtraPendingMinutes} 分钟。`
      : "之后添加的加餐任务仍需完成。"
    this.setData({
      restConfirmVisible: true,
      restConfirmContent: `使用后将完成今日日常任务，${extraText}使用后本月还剩 ${remainingAfterUse} 天休息权限。`
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
      () => consumeExerciseRestDay(),
      (dashboard) => `休息日权限已使用，还剩 ${dashboard.rest_days.remaining} 天`
    )
  },

  handleExtraClaim() {
    if (this.data.busy) return
    this.setData({
      minutesDialogVisible: true,
      minutesDialogMode: "extra",
      minutesDialogTitle: "添加加餐任务",
      minutesDialogPlaceholder: "需要额外运动多少分钟",
      minutesInput: ""
    })
  },

  handleComplete() {
    if (this.data.busy) return
    this.setData({
      minutesDialogVisible: true,
      minutesDialogMode: "complete",
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
    const mode = this.data.minutesDialogMode
    this.setData({ minutesDialogVisible: false, minutesInput: "" })
    if (mode === "extra") {
      const overachievedBeforeAdd = this.data.todayOverachievedMinutes
      this.runAction(
        "extra-claim",
        () => claimExerciseExtra(minutes),
        (dashboard) => {
          const offsetMinutes = Math.min(minutes, overachievedBeforeAdd)
          const pendingMinutes = dashboard.today.daily_pending_minutes
            + dashboard.today.extra_pending_minutes
          return offsetMinutes > 0
            ? `已抵扣 ${offsetMinutes} 分钟，今日还需 ${pendingMinutes} 分钟`
            : `已添加 ${minutes} 分钟，今日还需 ${pendingMinutes} 分钟`
        }
      )
    } else if (mode === "complete") {
      this.runAction("complete", () => completeExercise(minutes), `已记录 ${minutes} 分钟`)
    }
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

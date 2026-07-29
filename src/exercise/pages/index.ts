import {
  claimExerciseExtra,
  claimExerciseMonth,
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

function promptMinutes(title: string, placeholder: string): Promise<number | null> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content: "",
      editable: true,
      placeholderText: placeholder,
      confirmText: "确定",
      success: (result) => {
        if (!result.confirm) {
          resolve(null)
          return
        }
        const value = Number(String(result.content || "").trim())
        if (!Number.isInteger(value) || value <= 0 || value > 10000) {
          wx.showToast({ title: "请输入 1–10000 的整数", icon: "none" })
          resolve(null)
          return
        }
        resolve(value)
      },
      fail: () => resolve(null)
    })
  })
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    busy: false,
    busyAction: "",
    remainingMinutes: 0,
    todayPendingMinutes: 0,
    todayExtraPendingMinutes: 0,
    claimed: false,
    restDaysUsed: 0,
    restDaysTotal: 0,
    restDaysRemaining: 0,
    restDayUsedToday: false,
    restDayButtonText: "消耗休息日 0/0",
    restDayDisabled: true,
    bowlLabel: "没有",
    emotionLabel: PET_STATE_LABELS.empty,
    petImage: PET_IMAGES.empty[0],
    bowlImage: BOWL_IMAGES.empty[0],
    claimPreviewText: "计算本月剩余任务"
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
    let restDayButtonText = `消耗休息日 ${restDays.used}/${restDays.total}`
    if (!dashboard.month.claimed) {
      restDayButtonText = `领取月任务后可用休息日 0/${restDays.total}`
    } else if (restDays.remaining === 0) {
      restDayButtonText = `休息日已用完 ${restDays.used}/${restDays.total}`
    } else if (restDays.used_today) {
      restDayButtonText = `今日已使用休息日 ${restDays.used}/${restDays.total}`
    }
    this.setData({
      remainingMinutes: dashboard.month.remainingMinutes,
      todayPendingMinutes: dashboard.today.pending_minutes,
      todayExtraPendingMinutes: dashboard.today.extra_pending_minutes,
      claimed: dashboard.month.claimed,
      restDaysUsed: restDays.used,
      restDaysTotal: restDays.total,
      restDaysRemaining: restDays.remaining,
      restDayUsedToday: restDays.used_today,
      restDayButtonText,
      restDayDisabled: !dashboard.month.claimed
        || restDays.remaining === 0
        || restDays.used_today,
      bowlLabel: dashboard.cat.bowl_label,
      emotionLabel: PET_STATE_LABELS[bowlLevel],
      petImage: pickRandomImage(PET_IMAGES[bowlLevel], this.data.petImage),
      bowlImage: pickRandomImage(BOWL_IMAGES[bowlLevel], this.data.bowlImage),
      claimPreviewText: `${dashboard.claim_preview.exercise_days} 天 · ${dashboard.claim_preview.minutes} 分钟`
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

  handleMonthlyClaim() {
    if (this.data.claimed || this.data.busy) return
    wx.showModal({
      title: "领取本月任务",
      content: `将加入 ${this.data.claimPreviewText}。休息日由你当天手动使用，领取后本月不能重复领取。`,
      confirmText: "领取",
      success: (result) => {
        if (result.confirm) this.runAction("monthly", () => claimExerciseMonth(), "本月任务已加入")
      }
    })
  },

  handleRestDay() {
    if (this.data.restDayDisabled || this.data.busy) return
    this.runAction(
      "rest-day",
      () => consumeExerciseRestDay(),
      `休息日已使用，还剩 ${Math.max(0, this.data.restDaysRemaining - 1)} 次`
    )
  },

  async handleExtraClaim() {
    if (this.data.busy) return
    const minutes = await promptMinutes("领取加餐任务", "输入分钟数")
    if (minutes) this.runAction("extra-claim", () => claimExerciseExtra(minutes), `已加入 ${minutes} 分钟`)
  },

  async handleComplete() {
    if (this.data.busy) return
    const minutes = await promptMinutes("完成任务", "输入本次完成分钟数")
    if (!minutes) return
    this.runAction("complete", () => completeExercise(minutes), `已完成 ${minutes} 分钟`)
  },

  async runAction(
    action: string,
    request: () => Promise<ExerciseDashboard>,
    successMessage: string
  ) {
    if (this.data.busy) return
    this.setData({ busy: true, busyAction: action })
    try {
      const dashboard = await request()
      if (!isAsyncPageActive(this)) return
      this.applyDashboard(dashboard)
      wx.showToast({ title: successMessage, icon: "success" })
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

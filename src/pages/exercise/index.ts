import {
  claimExerciseExtra,
  claimExerciseMonth,
  completeExercise,
  getExerciseDashboard
} from "../../services/exercise"
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
    "/assets/exercise/pets/happy/01.webp",
    "/assets/exercise/pets/happy/02.webp",
    "/assets/exercise/pets/happy/03.webp",
    "/assets/exercise/pets/happy/04.webp",
    "/assets/exercise/pets/happy/05.webp"
  ],
  normal: [
    "/assets/exercise/pets/normal/01.webp",
    "/assets/exercise/pets/normal/02.webp",
    "/assets/exercise/pets/normal/03.webp",
    "/assets/exercise/pets/normal/04.webp",
    "/assets/exercise/pets/normal/05.webp"
  ],
  low: [
    "/assets/exercise/pets/unhappy/01.webp",
    "/assets/exercise/pets/unhappy/02.webp",
    "/assets/exercise/pets/unhappy/03.webp",
    "/assets/exercise/pets/unhappy/04.webp",
    "/assets/exercise/pets/unhappy/05.webp"
  ],
  empty: [
    "/assets/exercise/pets/pitiful/01.webp",
    "/assets/exercise/pets/pitiful/02.webp",
    "/assets/exercise/pets/pitiful/03.webp",
    "/assets/exercise/pets/pitiful/04.webp",
    "/assets/exercise/pets/pitiful/05.webp"
  ]
}

const BOWL_IMAGES: Record<ExerciseBowlLevel, readonly string[]> = {
  full: [
    "/assets/exercise/bowls/happy/01.webp",
    "/assets/exercise/bowls/happy/02.webp",
    "/assets/exercise/bowls/happy/03.webp",
    "/assets/exercise/bowls/happy/04.webp",
    "/assets/exercise/bowls/happy/05.webp"
  ],
  normal: [
    "/assets/exercise/bowls/normal/01.webp",
    "/assets/exercise/bowls/normal/02.webp",
    "/assets/exercise/bowls/normal/03.webp",
    "/assets/exercise/bowls/normal/04.webp",
    "/assets/exercise/bowls/normal/05.webp"
  ],
  low: [
    "/assets/exercise/bowls/unhappy/01.webp",
    "/assets/exercise/bowls/unhappy/02.webp",
    "/assets/exercise/bowls/unhappy/03.webp",
    "/assets/exercise/bowls/unhappy/04.webp",
    "/assets/exercise/bowls/unhappy/05.webp"
  ],
  empty: [
    "/assets/exercise/bowls/pitiful/01.webp",
    "/assets/exercise/bowls/pitiful/02.webp",
    "/assets/exercise/bowls/pitiful/03.webp",
    "/assets/exercise/bowls/pitiful/04.webp",
    "/assets/exercise/bowls/pitiful/05.webp"
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
    this.setData({
      remainingMinutes: dashboard.month.remainingMinutes,
      todayPendingMinutes: dashboard.today.pending_minutes,
      todayExtraPendingMinutes: dashboard.today.extra_pending_minutes,
      claimed: dashboard.month.claimed,
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
    wx.navigateTo({ url: "/pages/exercise/settings/index" })
  },

  handleMonthlyClaim() {
    if (this.data.claimed || this.data.busy) return
    wx.showModal({
      title: "领取本月任务",
      content: `将加入 ${this.data.claimPreviewText}。已按本月休息日设置折算，领取后本月不能重复领取。`,
      confirmText: "领取",
      success: (result) => {
        if (result.confirm) this.runAction("monthly", () => claimExerciseMonth(), "本月任务已加入")
      }
    })
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

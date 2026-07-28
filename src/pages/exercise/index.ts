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

const PET_STATE_LABELS: Record<ExerciseBowlLevel, string> = {
  full: "高兴",
  normal: "一般",
  low: "不高兴",
  empty: "可可怜怜"
}

const FOOD_LAYOUT = [
  { id: 1, type: "kibble", x: 15, y: 28, rotate: -18 },
  { id: 2, type: "freeze", x: 30, y: 58, rotate: 12 },
  { id: 3, type: "meat", x: 45, y: 23, rotate: -6 },
  { id: 4, type: "kibble", x: 61, y: 55, rotate: 20 },
  { id: 5, type: "freeze", x: 76, y: 27, rotate: -14 },
  { id: 6, type: "meat", x: 23, y: 12, rotate: 8 },
  { id: 7, type: "kibble", x: 52, y: 66, rotate: -22 },
  { id: 8, type: "freeze", x: 68, y: 8, rotate: 16 },
  { id: 9, type: "meat", x: 37, y: 5, rotate: -12 },
  { id: 10, type: "kibble", x: 83, y: 54, rotate: 5 },
  { id: 11, type: "freeze", x: 8, y: 62, rotate: 18 },
  { id: 12, type: "meat", x: 57, y: 31, rotate: -4 }
]

function pickPetImage(level: ExerciseBowlLevel, currentImage = "") {
  const images = PET_IMAGES[level]
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
    foodHeight: 0,
    foodTop: 91,
    foodWidth: 0,
    foodDepth: 0,
    foodPieces: [] as typeof FOOD_LAYOUT,
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
    const foodHeight = Math.round(dashboard.cat.food_ratio * 100)
    const foodWidth = foodHeight === 0 ? 0 : Math.round(112 + foodHeight * 0.58)
    const foodDepth = foodHeight === 0 ? 0 : Math.round(18 + foodHeight * 0.2)
    const foodTop = Math.round(93 - foodHeight * 0.17)
    const kibbleCount = foodHeight >= 75 ? 12 : foodHeight >= 42 ? 8 : foodHeight > 0 ? 4 : 0
    this.setData({
      remainingMinutes: dashboard.month.remainingMinutes,
      todayPendingMinutes: dashboard.today.pending_minutes,
      todayExtraPendingMinutes: dashboard.today.extra_pending_minutes,
      claimed: dashboard.month.claimed,
      bowlLabel: dashboard.cat.bowl_label,
      emotionLabel: PET_STATE_LABELS[bowlLevel],
      petImage: pickPetImage(bowlLevel, this.data.petImage),
      foodHeight,
      foodTop,
      foodWidth,
      foodDepth,
      foodPieces: FOOD_LAYOUT.slice(0, kibbleCount),
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

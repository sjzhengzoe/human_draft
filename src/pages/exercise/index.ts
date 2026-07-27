import {
  claimExerciseExtra,
  claimExerciseMonth,
  completeExercise,
  getExerciseDashboard
} from "../../services/exercise"
import type { ExerciseDashboard } from "../../types/exercise"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

const CAT_IMAGES = {
  happy: "/assets/exercise/cat-happy.png",
  neutral: "/assets/exercise/cat-neutral.png",
  hungry: "/assets/exercise/cat-hungry.png"
}

const KIBBLE_LAYOUT = [
  { id: 1, x: 15, y: 28, rotate: -18 },
  { id: 2, x: 30, y: 58, rotate: 12 },
  { id: 3, x: 45, y: 23, rotate: -6 },
  { id: 4, x: 61, y: 55, rotate: 20 },
  { id: 5, x: 76, y: 27, rotate: -14 },
  { id: 6, x: 23, y: 12, rotate: 8 },
  { id: 7, x: 52, y: 66, rotate: -22 },
  { id: 8, x: 68, y: 8, rotate: 16 },
  { id: 9, x: 37, y: 5, rotate: -12 },
  { id: 10, x: 83, y: 54, rotate: 5 },
  { id: 11, x: 8, y: 62, rotate: 18 },
  { id: 12, x: 57, y: 31, rotate: -4 }
]

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
    emotionLabel: "平淡",
    catImage: CAT_IMAGES.neutral,
    foodHeight: 0,
    foodTop: 91,
    foodWidth: 0,
    foodDepth: 0,
    kibblePieces: [] as typeof KIBBLE_LAYOUT,
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
      emotionLabel: dashboard.cat.emotion_label,
      catImage: CAT_IMAGES[dashboard.cat.emotion],
      foodHeight,
      foodTop,
      foodWidth,
      foodDepth,
      kibblePieces: KIBBLE_LAYOUT.slice(0, kibbleCount),
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

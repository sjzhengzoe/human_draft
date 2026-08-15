import {
  completeExercise,
  consumeExerciseRestDay,
  getExerciseDashboard,
  revokeExerciseRestDay
} from "../services/exercise"
import type { ExerciseBowlLevel, ExerciseDashboard } from "../../types/exercise"
import { getCurrentUser } from "../../services/auth"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { requireLoginForAction } from "../../utils/login-required"

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
const EXERCISE_IMAGE_SELECTION_STORAGE_PREFIX = "EXERCISE_DAILY_IMAGES_V2"
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

type ExerciseImageSelections = {
  petImage: string
  bowlImage: string
}

type ExerciseCalendarCell = {
  key: string
  date: string
  day: number | string
  state: string
  isToday: boolean
  isSelected: boolean
  selectable: boolean
  restUsed: boolean
  canUseRestDay: boolean
  dailyMinutes: number
  pendingMinutes: number
  recordedMinutes: number
  overachievedMinutes: number
  bowlLevel: ExerciseBowlLevel
  bowlLabel: string
  ariaLabel: string
}

function pickRandomImage(images: readonly string[]) {
  return images[Math.floor(Math.random() * images.length)]
}

function imageSelectionStorageKey(date: string) {
  return `${EXERCISE_IMAGE_SELECTION_STORAGE_PREFIX}:${getCurrentUser()?.uid || "local"}:${date}`
}

function getImagesForState(state: ExerciseBowlLevel, date: string) {
  const storageKey = imageSelectionStorageKey(date)
  try {
    const stored = wx.getStorageSync(storageKey) as ExerciseImageSelections | undefined
    if (
      stored
      && PET_IMAGES[state].includes(stored.petImage)
      && BOWL_IMAGES[state].includes(stored.bowlImage)
    ) {
      return stored
    }
  } catch (_error) {
    // 本地缓存不可用时仍可正常显示随机图片。
  }

  const selections: ExerciseImageSelections = {
    petImage: pickRandomImage(PET_IMAGES[state]),
    bowlImage: pickRandomImage(BOWL_IMAGES[state])
  }
  try {
    wx.setStorageSync(storageKey, selections)
  } catch (_error) {
    // 缓存写入失败不影响运动数据和页面使用。
  }
  return selections
}

function shiftCalendarMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`
}

function dateDisplayLabel(date: string, today: string) {
  if (date === today) return "今日"
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return `${month}月${day}日`
}

function guestCalendarContext() {
  const now = new Date(Date.now() + SHANGHAI_OFFSET_MS)
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const day = now.getUTCDate()
  const monthValue = `${year}-${String(month).padStart(2, "0")}`
  const today = `${monthValue}-${String(day).padStart(2, "0")}`
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const calendarCells: ExerciseCalendarCell[] = [
    ...Array.from({ length: firstWeekday }, (_, index) => ({
      key: `guest-blank-${index}`,
      date: "",
      day: "",
      state: "blank",
      isToday: false,
      isSelected: false,
      selectable: false,
      restUsed: false,
      canUseRestDay: false,
      dailyMinutes: 0,
      pendingMinutes: 0,
      recordedMinutes: 0,
      overachievedMinutes: 0,
      bowlLevel: "empty" as ExerciseBowlLevel,
      bowlLabel: "没有",
      ariaLabel: ""
    })),
    ...Array.from({ length: daysInMonth }, (_, index) => {
      const calendarDay = index + 1
      const date = `${monthValue}-${String(calendarDay).padStart(2, "0")}`
      const isToday = calendarDay === day
      return {
        key: `guest-${date}`,
        date,
        day: calendarDay,
        state: date > today ? "future" : "untracked",
        isToday,
        isSelected: isToday,
        selectable: false,
        restUsed: false,
        canUseRestDay: false,
        dailyMinutes: 0,
        pendingMinutes: 0,
        recordedMinutes: 0,
        overachievedMinutes: 0,
        bowlLevel: "empty" as ExerciseBowlLevel,
        bowlLabel: "没有",
        ariaLabel: `${month}月${calendarDay}日${isToday ? "，今天" : ""}`
      }
    })
  ]

  return { year, month, today, monthValue, calendarCells }
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    guestMode: false,
    busy: false,
    busyAction: "",
    selectedDate: "",
    todayDate: "",
    selectedDateLabel: "今日",
    selectedTaskTitle: "今日任务",
    selectedPendingMinutes: 0,
    selectedDailyTaskState: "pending",
    selectedPendingTotal: 0,
    selectedRecordedMinutes: 0,
    selectedOverachievedMinutes: 0,
    selectedRestUsed: false,
    selectedCanUseRestDay: false,
    selectedShowUseRestDay: false,
    selectedUseRestDayText: "使用休息日",
    selectedCanRevokeRestDay: false,
    selectedActionDisabled: false,
    yearIncompleteDays: 0,
    calendarIncompleteDays: 0,
    restCreditBalance: 0,
    currentMonthGrant: 0,
    completeButtonText: "完成运动",
    bowlLabel: "没有",
    emotionLabel: PET_STATE_LABELS.empty,
    petImage: PET_IMAGES.empty[0],
    bowlImage: BOWL_IMAGES.empty[0],
    calendarCatImage: CALENDAR_CAT_IMAGE,
    calendarDogImage: CALENDAR_DOG_IMAGE,
    calendarMonthLabel: "本月",
    calendarMonthValue: "",
    calendarPickerValue: "",
    calendarPickerStart: "",
    calendarPickerEnd: "",
    calendarIsCurrent: true,
    calendarCanGoPrevious: false,
    calendarCanGoNext: false,
    calendarLoading: false,
    calendarCells: [] as ExerciseCalendarCell[],
    minutesDialogVisible: false,
    minutesDialogTitle: "",
    minutesDialogPlaceholder: "",
    minutesInput: "",
    restDialogVisible: false,
    restDialogAction: "use",
    restDialogTitle: "使用休息日",
    restDialogContent: "",
    restDialogConfirmText: "确认使用"
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.showGuestCalendar()
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    this.loadDashboard()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  showGuestCalendar() {
    const context = guestCalendarContext()
    const stateImages = getImagesForState("empty", context.today)
    this.setData({
      loading: false,
      hasLoaded: true,
      guestMode: true,
      busy: false,
      busyAction: "",
      selectedDate: context.today,
      todayDate: context.today,
      selectedDateLabel: "今日",
      selectedTaskTitle: "今日任务",
      selectedPendingMinutes: 0,
      selectedDailyTaskState: "pending",
      selectedPendingTotal: 0,
      selectedRecordedMinutes: 0,
      selectedOverachievedMinutes: 0,
      selectedRestUsed: false,
      selectedCanUseRestDay: false,
      selectedShowUseRestDay: false,
      selectedCanRevokeRestDay: false,
      selectedActionDisabled: false,
      yearIncompleteDays: 0,
      calendarIncompleteDays: 0,
      restCreditBalance: 0,
      currentMonthGrant: 0,
      completeButtonText: "完成运动",
      bowlLabel: "没有",
      emotionLabel: PET_STATE_LABELS.empty,
      petImage: stateImages.petImage,
      bowlImage: stateImages.bowlImage,
      calendarMonthLabel: `${context.year}年${context.month}月`,
      calendarMonthValue: context.monthValue,
      calendarPickerValue: `${context.monthValue}-01`,
      calendarPickerStart: `${context.monthValue}-01`,
      calendarPickerEnd: `${context.monthValue}-01`,
      calendarIsCurrent: true,
      calendarCanGoPrevious: false,
      calendarCanGoNext: false,
      calendarLoading: false,
      calendarCells: context.calendarCells,
      minutesDialogVisible: false,
      restDialogVisible: false
    })
  },

  applyDashboard(dashboard: ExerciseDashboard) {
    const restDays = dashboard.rest_days
    const calendarCells: ExerciseCalendarCell[] = [
      ...Array.from({ length: dashboard.month.first_weekday }, (_, index) => ({
        key: `blank-${index}`,
        date: "",
        day: "",
        state: "blank",
        isToday: false,
        isSelected: false,
        selectable: false,
        restUsed: false,
        canUseRestDay: false,
        dailyMinutes: 0,
        pendingMinutes: 0,
        recordedMinutes: 0,
        overachievedMinutes: 0,
        bowlLevel: "empty" as ExerciseBowlLevel,
        bowlLabel: "没有",
        ariaLabel: ""
      })),
      ...dashboard.month.days.map((item) => ({
        key: item.date,
        date: item.date,
        day: item.day,
        state: item.state,
        isToday: item.date === dashboard.today.date,
        isSelected: false,
        selectable: item.state === "completed" || item.state === "incomplete",
        restUsed: item.rest_used,
        canUseRestDay: item.can_use_rest_day,
        dailyMinutes: item.daily_minutes || 0,
        pendingMinutes: item.daily_pending_minutes || 0,
        recordedMinutes: item.recorded_minutes || 0,
        overachievedMinutes: item.overachieved_minutes || 0,
        bowlLevel: item.bowl_level || "empty",
        bowlLabel: item.bowl_label || "没有",
        ariaLabel: `${Number(item.date.slice(5, 7))}月${item.day}日${item.state === "completed" ? "已完成" : item.state === "incomplete" ? "未完成" : "不可选择"}`
      }))
    ]
    const preferredDate = this.data.selectedDate
    let selectedDay = calendarCells.find((item) => item.date === preferredDate && item.selectable)
    if (!selectedDay) {
      selectedDay = calendarCells.find((item) => item.date === dashboard.today.date && item.selectable)
    }
    if (!selectedDay) {
      selectedDay = {
        key: dashboard.today.date,
        date: dashboard.today.date,
        day: Number(dashboard.today.date.slice(8, 10)),
        state: dashboard.today.completed ? "completed" : "incomplete",
        isToday: true,
        isSelected: false,
        selectable: true,
        restUsed: restDays.used_today,
        canUseRestDay: false,
        dailyMinutes: dashboard.today.daily_minutes,
        pendingMinutes: dashboard.today.daily_pending_minutes,
        recordedMinutes: dashboard.today.recorded_minutes,
        overachievedMinutes: dashboard.today.overachieved_minutes,
        bowlLevel: dashboard.cat.bowl_level,
        bowlLabel: dashboard.cat.bowl_label,
        ariaLabel: "今日"
      }
    }
    const selectedCells = calendarCells.map((item) => ({
      ...item,
      isSelected: item.date === selectedDay.date
    }))
    const calendarIncompleteDays = dashboard.month.days.filter(
      (item) => item.state === "incomplete"
    ).length
    this.setData({
      yearIncompleteDays: dashboard.year.incomplete_days,
      calendarIncompleteDays,
      restCreditBalance: dashboard.rest_days.balance,
      currentMonthGrant: dashboard.rest_days.monthly_grant,
      todayDate: dashboard.today.date,
      calendarMonthLabel: `${dashboard.month.year}年${dashboard.month.month}月`,
      calendarMonthValue: dashboard.month.value,
      calendarPickerValue: `${dashboard.month.value}-01`,
      calendarPickerStart: `${dashboard.month.min_month}-01`,
      calendarPickerEnd: `${dashboard.month.max_month}-01`,
      calendarIsCurrent: dashboard.month.is_current,
      calendarCanGoPrevious: dashboard.month.value > dashboard.month.min_month,
      calendarCanGoNext: dashboard.month.value < dashboard.month.max_month,
      calendarCells: selectedCells
    })
    this.applySelectedDay(selectedDay, dashboard.today.date, false)
  },

  applySelectedDay(cell: ExerciseCalendarCell, today: string, updateCells = true) {
    const stateImages = getImagesForState(cell.bowlLevel, cell.date)
    const label = dateDisplayLabel(cell.date, today)
    const canRevokeRestDay = cell.restUsed
    this.setData({
      selectedDate: cell.date,
      selectedDateLabel: label,
      selectedTaskTitle: `${label}任务`,
      selectedPendingMinutes: cell.pendingMinutes,
      selectedDailyTaskState: cell.restUsed
        ? "rest"
        : cell.pendingMinutes === 0 ? "completed" : "pending",
      selectedPendingTotal: cell.pendingMinutes,
      selectedRecordedMinutes: cell.recordedMinutes,
      selectedOverachievedMinutes: cell.overachievedMinutes,
      selectedRestUsed: cell.restUsed,
      selectedCanUseRestDay: cell.canUseRestDay,
      selectedShowUseRestDay: !cell.restUsed && cell.state === "incomplete",
      selectedUseRestDayText: cell.canUseRestDay
        ? "使用休息日"
        : "休息额度不足",
      selectedCanRevokeRestDay: canRevokeRestDay,
      selectedActionDisabled: false,
      completeButtonText: cell.restUsed
        ? "撤回休息日"
        : cell.pendingMinutes === 0 ? "记录额外运动" : "完成运动",
      bowlLabel: cell.bowlLabel,
      emotionLabel: PET_STATE_LABELS[cell.bowlLevel],
      petImage: stateImages.petImage,
      bowlImage: stateImages.bowlImage,
      ...(updateCells ? {
        calendarCells: this.data.calendarCells.map((item) => ({
          ...item,
          isSelected: item.date === cell.date
        }))
      } : {})
    })
  },

  async loadDashboard(month?: string) {
    if (!getCurrentUser()) return
    const generation = beginAsyncPageRequest(this)
    const requestedMonth = month ?? this.data.calendarMonthValue
    if (!this.data.hasLoaded) {
      this.setData({ loading: true })
    } else {
      this.setData({ calendarLoading: true })
    }
    try {
      const dashboard = await getExerciseDashboard(requestedMonth)
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
        this.setData({ loading: false, hasLoaded: true, calendarLoading: false })
      }
    }
  },

  handlePreviousMonth() {
    if (!this.data.calendarCanGoPrevious || this.data.calendarLoading || this.data.busy) return
    this.loadDashboard(shiftCalendarMonth(this.data.calendarMonthValue, -1))
  },

  handleNextMonth() {
    if (!this.data.calendarCanGoNext || this.data.calendarLoading || this.data.busy) return
    this.loadDashboard(shiftCalendarMonth(this.data.calendarMonthValue, 1))
  },

  handleCalendarMonthChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.calendarLoading || this.data.busy) return
    const month = String(event.detail.value || "").slice(0, 7)
    if (!month || month === this.data.calendarMonthValue) return
    this.loadDashboard(month)
  },

  handleCalendarDayTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.calendarLoading || this.data.busy) return
    const date = String(event.currentTarget.dataset.date || "")
    const selectedDay = this.data.calendarCells.find((item) => item.date === date)
    if (!selectedDay?.selectable) return
    this.applySelectedDay(selectedDay, this.data.todayDate)
  },

  handleSettings() {
    if (this.data.busy) return
    wx.navigateTo({ url: "/exercise/pages/settings/index" })
  },

  handleComplete() {
    if (!requireLoginForAction(this)) return
    if (this.data.busy) return
    if (this.data.selectedRestUsed) {
      if (!this.data.selectedCanRevokeRestDay) return
      this.setData({
        restDialogVisible: true,
        restDialogAction: "revoke",
        restDialogTitle: "撤回休息日",
        restDialogContent: `撤回后，${this.data.selectedDateLabel}会恢复为实际运动状态，并返还 1 天休息额度。`,
        restDialogConfirmText: "确认撤回"
      })
      return
    }
    this.setData({
      minutesDialogVisible: true,
      minutesDialogTitle: "记录运动分钟",
      minutesDialogPlaceholder: this.data.selectedPendingTotal > 0
        ? `${this.data.selectedDateLabel}还需 ${this.data.selectedPendingTotal} 分钟，可继续记录超额`
        : "输入额外运动分钟数",
      minutesInput: this.data.selectedPendingTotal > 0 ? String(this.data.selectedPendingTotal) : ""
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

  handleUseRestDay() {
    if (!requireLoginForAction(this)) return
    if (this.data.busy || !this.data.selectedCanUseRestDay) return
    const remaining = Math.max(0, this.data.restCreditBalance - 1)
    this.setData({
      restDialogVisible: true,
      restDialogAction: "use",
      restDialogTitle: "使用休息日",
      restDialogContent: `使用后将把${this.data.selectedDateLabel}的日常任务标记为完成，并消耗 1 天休息额度。使用后剩余 ${remaining} 天。`,
      restDialogConfirmText: "确认使用"
    })
  },

  closeRestDialog() {
    if (this.data.busy) return
    this.setData({ restDialogVisible: false })
  },

  confirmRestDialog() {
    if (this.data.busy) return
    const selectedDate = this.data.selectedDate
    const selectedLabel = this.data.selectedDateLabel
    const isRevoke = this.data.restDialogAction === "revoke"
    if (isRevoke && !this.data.selectedCanRevokeRestDay) return
    if (!isRevoke && !this.data.selectedCanUseRestDay) return
    this.setData({ restDialogVisible: false })
    this.runAction(
      isRevoke ? "revoke" : "rest",
      () => isRevoke
        ? revokeExerciseRestDay(selectedDate)
        : consumeExerciseRestDay(selectedDate),
      isRevoke ? `${selectedLabel}已撤回` : `${selectedLabel}已休息`
    )
  },

  confirmMinutesDialog() {
    if (this.data.busy) return
    const minutes = Number(String(this.data.minutesInput || "").trim())
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 10000) {
      wx.showToast({ title: "请输入 1–10000 的整数", icon: "none" })
      return
    }
    this.setData({ minutesDialogVisible: false, minutesInput: "" })
    const selectedDate = this.data.selectedDate
    const successMessage = selectedDate === this.data.todayDate
      ? `已记录 ${minutes} 分钟`
      : `已补记 ${minutes} 分钟`
    this.runAction(
      "complete",
      () => completeExercise(minutes, selectedDate),
      successMessage
    )
  },

  async runAction(
    action: string,
    request: () => Promise<ExerciseDashboard>,
    successMessage: string | ((dashboard: ExerciseDashboard) => string)
  ) {
    if (this.data.busy) return
    this.setData({ busy: true, busyAction: action })
    try {
      const viewedMonth = this.data.calendarMonthValue
      const dashboard = await request()
      if (!isAsyncPageActive(this)) return
      const displayDashboard = viewedMonth && viewedMonth !== dashboard.month.value
        ? await getExerciseDashboard(viewedMonth)
        : dashboard
      if (!isAsyncPageActive(this)) return
      this.applyDashboard(displayDashboard)
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

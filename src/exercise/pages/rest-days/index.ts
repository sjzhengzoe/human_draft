import {
  consumeExerciseRestDay,
  getExerciseRestCalendar
} from "../../services/exercise"
import type {
  ExerciseCalendarDayState,
  ExerciseRestCalendar
} from "../../../types/exercise"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type RestCalendarCell = {
  key: string
  date: string
  day: number | string
  state: ExerciseCalendarDayState | "blank"
  restUsed: boolean
  canUseRestDay: boolean
  isToday: boolean
  isSelected: boolean
}

const CALENDAR_CAT_IMAGE = "/exercise/assets/calendar/happy-cat.png"
const CALENDAR_DOG_IMAGE = "/exercise/assets/calendar/unhappy-dog.png"

function selectionHint(cell?: RestCalendarCell) {
  if (!cell) return "切换月份查看其他日期"
  if (cell.restUsed) return "这一天已使用休息日权限完成"
  if (cell.state === "completed") return "这一天已经完成，无需补卡"
  if (!cell.canUseRestDay) return "该月休息日权限已用完"
  return "可使用该月休息日权限完成补卡"
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`
}

function displayDate(date: string, today: string) {
  if (date === today) return "今天"
  const [, month, day] = date.split("-").map(Number)
  return `${month}月${day}日`
}

Page({
  data: {
    loading: true,
    hasLoaded: false,
    busy: false,
    calendarLoading: false,
    monthValue: "",
    monthLabel: "",
    pickerValue: "",
    pickerStart: "",
    pickerEnd: "",
    canGoPrevious: false,
    canGoNext: false,
    today: "",
    calendarCatImage: CALENDAR_CAT_IMAGE,
    calendarDogImage: CALENDAR_DOG_IMAGE,
    cells: [] as RestCalendarCell[],
    selectedDate: "",
    selectedDateLabel: "",
    selectedCanUseRestDay: false,
    selectedHint: "切换月份查看其他日期",
    confirmVisible: false,
    confirmContent: "",
    restDaysUsed: 0,
    restDaysTotal: 0,
    restDaysRemaining: 0,
    monthIncompleteDays: 0,
    monthCompletedDays: 0,
    yearIncompleteDays: 0,
    yearCompletedDays: 0,
    eligibleDays: 0,
    incompleteDays: 0,
    emptyMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
    this.loadCalendar()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  applyCalendar(calendar: ExerciseRestCalendar, preserveSelection = false) {
    const eligible = calendar.month.days.filter((item) => item.can_use_rest_day)
    const selectable = calendar.month.days.filter(
      (item) => item.state === "completed" || item.state === "incomplete"
    )
    const existingSelection = preserveSelection
      ? selectable.find((item) => item.date === this.data.selectedDate)?.date || ""
      : ""
    const preferredDate = existingSelection
      || selectable.find((item) => item.date === calendar.today)?.date
      || eligible[eligible.length - 1]?.date
      || selectable[selectable.length - 1]?.date
      || ""
    const cells: RestCalendarCell[] = [
      ...Array.from({ length: calendar.month.first_weekday }, (_, index) => ({
        key: `blank-${index}`,
        date: "",
        day: "",
        state: "blank" as const,
        restUsed: false,
        canUseRestDay: false,
        isToday: false,
        isSelected: false
      })),
      ...calendar.month.days.map((item) => ({
        key: item.date,
        date: item.date,
        day: item.day,
        state: item.state,
        restUsed: item.rest_used,
        canUseRestDay: item.can_use_rest_day,
        isToday: item.date === calendar.today,
        isSelected: item.date === preferredDate
      }))
    ]
    const incompleteDays = calendar.month.days.filter(
      (item) => item.state === "incomplete"
    ).length
    const selectedCell = cells.find((item) => item.date === preferredDate)
    let emptyMessage = ""
    if (incompleteDays === 0) {
      emptyMessage = "本月全部完成，无需补卡"
    } else if (calendar.month.rest_days.remaining === 0) {
      emptyMessage = "本月休息日权限已用完"
    }
    this.setData({
      monthValue: calendar.month.value,
      monthLabel: `${calendar.month.year}年${calendar.month.month}月`,
      pickerValue: `${calendar.month.value}-01`,
      pickerStart: `${calendar.month.min_month}-01`,
      pickerEnd: `${calendar.month.max_month}-01`,
      canGoPrevious: calendar.month.value > calendar.month.min_month,
      canGoNext: calendar.month.value < calendar.month.max_month,
      today: calendar.today,
      cells,
      selectedDate: preferredDate,
      selectedDateLabel: preferredDate ? displayDate(preferredDate, calendar.today) : "",
      selectedCanUseRestDay: Boolean(selectedCell?.canUseRestDay),
      selectedHint: selectionHint(selectedCell),
      restDaysUsed: calendar.month.rest_days.used,
      restDaysTotal: calendar.month.rest_days.total,
      restDaysRemaining: calendar.month.rest_days.remaining,
      monthIncompleteDays: calendar.stats.month.incomplete_days,
      monthCompletedDays: calendar.stats.month.completed_days,
      yearIncompleteDays: calendar.stats.year.incomplete_days,
      yearCompletedDays: calendar.stats.year.completed_days,
      eligibleDays: eligible.length,
      incompleteDays,
      emptyMessage
    })
  },

  async loadCalendar(month?: string, preserveSelection = false) {
    const generation = beginAsyncPageRequest(this)
    if (!this.data.hasLoaded) {
      this.setData({ loading: true })
    } else {
      this.setData({ calendarLoading: true })
    }
    try {
      const calendar = await getExerciseRestCalendar(month || this.data.monthValue)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyCalendar(calendar, preserveSelection)
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
    if (!this.data.canGoPrevious || this.data.calendarLoading || this.data.busy) return
    this.loadCalendar(shiftMonth(this.data.monthValue, -1))
  },

  handleNextMonth() {
    if (!this.data.canGoNext || this.data.calendarLoading || this.data.busy) return
    this.loadCalendar(shiftMonth(this.data.monthValue, 1))
  },

  handleMonthChange(event: WechatMiniprogram.PickerChange) {
    if (this.data.calendarLoading || this.data.busy) return
    const month = String(event.detail.value || "").slice(0, 7)
    if (!month || month === this.data.monthValue) return
    this.loadCalendar(month)
  },

  handleDayTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.busy || this.data.calendarLoading) return
    const date = String(event.currentTarget.dataset.date || "")
    const cell = this.data.cells.find((item) => item.date === date)
    if (!cell || (cell.state !== "completed" && cell.state !== "incomplete")) return
    const cells = this.data.cells.map((item) => ({
      ...item,
      isSelected: item.date === date
    }))
    this.setData({
      cells,
      selectedDate: date,
      selectedDateLabel: displayDate(date, this.data.today),
      selectedCanUseRestDay: cell.canUseRestDay,
      selectedHint: selectionHint(cell)
    })
  },

  handleUseRestDay() {
    if (this.data.busy || !this.data.selectedDate || !this.data.selectedCanUseRestDay) return
    const remaining = Math.max(0, this.data.restDaysRemaining - 1)
    this.setData({
      confirmVisible: true,
      confirmContent: `使用后将把${this.data.selectedDateLabel}的日常任务标记为完成。使用后该月还剩 ${remaining} 天休息权限。`
    })
  },

  handleConfirmCancel() {
    if (this.data.busy) return
    this.setData({ confirmVisible: false })
  },

  async handleConfirm() {
    if (this.data.busy || !this.data.selectedDate || !this.data.selectedCanUseRestDay) return
    const selectedLabel = this.data.selectedDateLabel
    this.setData({ confirmVisible: false, busy: true })
    try {
      await consumeExerciseRestDay(this.data.selectedDate)
      if (!isAsyncPageActive(this)) return
      await this.loadCalendar(this.data.monthValue, true)
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: `${selectedLabel}已补卡`, icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "补卡失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ busy: false })
    }
  }
})

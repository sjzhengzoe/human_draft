import { ensureLogin } from "../../../services/auth"
import {
  getMenuScheduleRange,
  listDishes,
  replaceMenuScheduleMeal
} from "../../../services/menu"
import { initializeUIFont } from "../../../services/ui-font"
import type {
  Dish,
  MealPeriod,
  MenuScheduleItem,
  MenuScheduleMeal
} from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type TimeMode = "day" | "week" | "month" | "year"

type PlanSlot = {
  key: string
  item: MenuScheduleItem | null
  locked: boolean
}

type MealSection = {
  key: MealPeriod
  label: string
  englishLabel: string
  slotCount: number
  slots: PlanSlot[]
}

type WeekDay = {
  date: string
  dayLabel: string
  dateLabel: string
  isToday: boolean
  meals: Array<{
    key: MealPeriod
    label: string
    count: number
    items: Array<{
      key: string
      name: string
      imageUrl: string
      fallbackText: string
    }>
  }>
}

type MonthCell = {
  key: string
  date: string
  day: string
  inMonth: boolean
  isToday: boolean
  count: number
}

type YearMonth = {
  month: number
  label: string
  count: number
  mealCount: number
}

type ScheduleInputItem =
  | { source_kind: "dish"; dish_id: string }
  | { source_kind: "place"; place_id: string }
  | { archived_item_id: string }

const DEFAULT_SLOT_COUNT = 3
const DEFAULT_MEAL_PERIODS: MealPeriod[] = ["lunch", "dinner"]
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]
const MEAL_DEFINITIONS: Array<Pick<MealSection, "key" | "label" | "englishLabel">> = [
  { key: "breakfast", label: "早餐", englishLabel: "GOOD MORNING" },
  { key: "lunch", label: "午餐", englishLabel: "LUNCH TIME" },
  { key: "afternoon_tea", label: "下午茶", englishLabel: "TEA TIME" },
  { key: "dinner", label: "晚餐", englishLabel: "DINNER TIME" }
]

function pad(value: number): string {
  return String(value).padStart(2, "0")
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value)
  date.setDate(date.getDate() + amount)
  return formatDate(date)
}

function addMonths(value: string, amount: number): string {
  const date = parseDate(value)
  const day = date.getDate()
  date.setDate(1)
  date.setMonth(date.getMonth() + amount)
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()))
  return formatDate(date)
}

function addYears(value: string, amount: number): string {
  const date = parseDate(value)
  date.setFullYear(date.getFullYear() + amount)
  return formatDate(date)
}

function startOfWeek(value: string): string {
  const date = parseDate(value)
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay()
  date.setDate(date.getDate() + offset)
  return formatDate(date)
}

function rangeFor(mode: TimeMode, anchor: string): { start: string; end: string } {
  const date = parseDate(anchor)
  if (mode === "day") return { start: anchor, end: anchor }
  if (mode === "week") {
    const start = startOfWeek(anchor)
    return { start, end: addDays(start, 6) }
  }
  if (mode === "month") {
    const start = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`
    return {
      start,
      end: formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0))
    }
  }
  return {
    start: `${date.getFullYear()}-01-01`,
    end: `${date.getFullYear()}-12-31`
  }
}

function periodLabel(mode: TimeMode, anchor: string): string {
  const date = parseDate(anchor)
  const today = formatDate(new Date())
  if (mode === "day") {
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${anchor === today ? "今天" : `星期${WEEKDAYS[date.getDay()]}`}`
  }
  const range = rangeFor(mode, anchor)
  if (mode === "week") {
    const end = parseDate(range.end)
    return `${date.getFullYear()}年${parseDate(range.start).getMonth() + 1}月${parseDate(range.start).getDate()}日—${end.getMonth() + 1}月${end.getDate()}日`
  }
  if (mode === "month") return `${date.getFullYear()}年${date.getMonth() + 1}月`
  return `${date.getFullYear()}年`
}

function mealFor(meals: MenuScheduleMeal[], date: string, period: MealPeriod): MenuScheduleMeal | undefined {
  return meals.find((meal) => meal.meal_date === date && meal.meal_period === period)
}

function toMealSections(meals: MenuScheduleMeal[], date: string): MealSection[] {
  return MEAL_DEFINITIONS.map((definition) => {
    const meal = mealFor(meals, date, definition.key)
    const slotCount = meal?.slot_count || DEFAULT_SLOT_COUNT
    return {
      ...definition,
      slotCount,
      slots: Array.from({ length: slotCount }, (_value, index) => ({
        key: `${date}:${definition.key}:${index}`,
        item: meal?.items[index] || null,
        locked: false
      }))
    }
  })
}

function toWeekDays(meals: MenuScheduleMeal[], anchor: string): WeekDay[] {
  const start = startOfWeek(anchor)
  const today = formatDate(new Date())
  return Array.from({ length: 7 }, (_value, index) => {
    const date = addDays(start, index)
    const parsed = parseDate(date)
    return {
      date,
      dayLabel: `周${WEEKDAYS[parsed.getDay()]}`,
      dateLabel: `${parsed.getMonth() + 1}.${parsed.getDate()}`,
      isToday: date === today,
      meals: MEAL_DEFINITIONS.map((definition) => {
        const meal = mealFor(meals, date, definition.key)
        const items = (meal?.items || []).map((item, itemIndex) => ({
          key: `${date}:${definition.key}:${item.id || itemIndex}`,
          name: item.name,
          imageUrl: item.image_url || item.place_image_url || "",
          fallbackText: item.name.slice(0, 1)
        }))
        return {
          key: definition.key,
          label: definition.label,
          count: items.length,
          items
        }
      })
    }
  })
}

function toMonthCells(meals: MenuScheduleMeal[], anchor: string): MonthCell[] {
  const current = parseDate(anchor)
  const first = new Date(current.getFullYear(), current.getMonth(), 1)
  const mondayOffset = first.getDay() === 0 ? 6 : first.getDay() - 1
  const start = formatDate(new Date(current.getFullYear(), current.getMonth(), 1 - mondayOffset))
  const today = formatDate(new Date())
  return Array.from({ length: 42 }, (_value, index) => {
    const date = addDays(start, index)
    const parsed = parseDate(date)
    return {
      key: date,
      date,
      day: String(parsed.getDate()),
      inMonth: parsed.getMonth() === current.getMonth(),
      isToday: date === today,
      count: meals
        .filter((meal) => meal.meal_date === date)
        .reduce((sum, meal) => sum + meal.items.length, 0)
    }
  })
}

function toYearMonths(meals: MenuScheduleMeal[], anchor: string): YearMonth[] {
  const year = parseDate(anchor).getFullYear()
  return Array.from({ length: 12 }, (_value, index) => {
    const prefix = `${year}-${pad(index + 1)}-`
    const monthMeals = meals.filter((meal) => meal.meal_date.startsWith(prefix))
    return {
      month: index + 1,
      label: `${index + 1}月`,
      count: monthMeals.reduce((sum, meal) => sum + meal.items.length, 0),
      mealCount: monthMeals.filter((meal) => meal.items.length > 0).length
    }
  })
}

function mealPeriodsFor(dish: Dish): MealPeriod[] {
  return Array.isArray(dish.meal_periods) && dish.meal_periods.length > 0
    ? dish.meal_periods
    : DEFAULT_MEAL_PERIODS
}

function pickRandom<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined
}

function temporaryScheduleItem(dish: Dish, position: number): MenuScheduleItem {
  return {
    id: `temporary:${dish.id}`,
    source_kind: "dish",
    record_type: dish.record_type,
    dish_id: dish.id,
    place_id: dish.place_id,
    name: dish.name,
    place_name: "",
    image_url: dish.thumbnail_url || dish.image_url,
    place_image_url: "",
    position,
    archived: false
  }
}

function scheduleInputsFromSlots(slots: PlanSlot[]): ScheduleInputItem[] {
  const items: ScheduleInputItem[] = []
  slots.forEach((slot) => {
    if (slot.item?.archived) {
      items.push({ archived_item_id: slot.item.id })
    } else if (slot.item?.source_kind === "dish" && slot.item.dish_id) {
      items.push({ source_kind: "dish", dish_id: slot.item.dish_id })
    } else if (slot.item?.source_kind === "place" && slot.item.place_id) {
      items.push({ source_kind: "place", place_id: slot.item.place_id })
    }
  })
  return items
}

async function listAllDishes(): Promise<Dish[]> {
  const dishes: Dish[] = []
  let page = 1
  while (page <= 20) {
    const batch = await listDishes({ sort: "custom", page, page_size: 100 })
    dishes.push(...batch.filter((dish) => Boolean(dish.place_id)))
    if (batch.length < 100) break
    page += 1
  }
  return dishes
}

Page({
  data: {
    activeMode: "day" as TimeMode,
    selectedDate: formatDate(new Date()),
    periodLabel: periodLabel("day", formatDate(new Date())),
    meals: [] as MenuScheduleMeal[],
    dayMeals: [] as MealSection[],
    weekDays: [] as WeekDay[],
    monthCells: [] as MonthCell[],
    yearMonths: [] as YearMonth[],
    dishes: [] as Dish[],
    loading: true,
    saving: false,
    hasLoaded: false,
    errorMessage: "",
    showRemoveDialog: false,
    removeMealIndex: -1
  },

  onLoad() {
    activateAsyncPage(this)
    this.loadInitialData()
  },

  onShow() {
    activateAsyncPage(this)
    if (this.data.hasLoaded) this.loadSchedule()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadInitialData() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true, errorMessage: "" })
    try {
      await Promise.all([initializeUIFont().catch(() => undefined), ensureLogin()])
      const dishes = await listAllDishes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ dishes })
      await this.loadSchedule(generation)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({ errorMessage: error instanceof Error ? error.message : "本周菜单加载失败" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, hasLoaded: true })
      }
    }
  },

  async loadSchedule(existingGeneration?: number) {
    const generation = existingGeneration || beginAsyncPageRequest(this)
    const range = rangeFor(this.data.activeMode, this.data.selectedDate)
    if (!existingGeneration) this.setData({ loading: true, errorMessage: "" })
    try {
      const result = await getMenuScheduleRange(range.start, range.end)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applySchedule(result.meals)
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ errorMessage: error instanceof Error ? error.message : "本周菜单加载失败" })
      }
    } finally {
      if (!existingGeneration && isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, hasLoaded: true })
      }
    }
  },

  applySchedule(meals: MenuScheduleMeal[]) {
    this.setData({
      meals,
      periodLabel: periodLabel(this.data.activeMode, this.data.selectedDate),
      dayMeals: toMealSections(meals, this.data.selectedDate),
      weekDays: toWeekDays(meals, this.data.selectedDate),
      monthCells: toMonthCells(meals, this.data.selectedDate),
      yearMonths: toYearMonths(meals, this.data.selectedDate)
    })
  },

  handleRetry() {
    this.loadInitialData()
  },

  handleModeTap(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode || "day") as TimeMode
    if (!["day", "week", "month", "year"].includes(mode) || mode === this.data.activeMode) return
    this.setData({ activeMode: mode }, () => this.loadSchedule())
  },

  handlePeriodMove(event: WechatMiniprogram.TouchEvent) {
    const direction = Number(event.currentTarget.dataset.direction) < 0 ? -1 : 1
    const selectedDate = this.data.activeMode === "day"
      ? addDays(this.data.selectedDate, direction)
      : this.data.activeMode === "week"
        ? addDays(this.data.selectedDate, direction * 7)
        : this.data.activeMode === "month"
          ? addMonths(this.data.selectedDate, direction)
          : addYears(this.data.selectedDate, direction)
    this.setData({ selectedDate }, () => this.loadSchedule())
  },

  handleToday() {
    const selectedDate = formatDate(new Date())
    this.setData({ selectedDate }, () => this.loadSchedule())
  },

  handleMonthDayTap(event: WechatMiniprogram.TouchEvent) {
    const selectedDate = String(event.currentTarget.dataset.date || "")
    if (!selectedDate) return
    this.setData({ selectedDate, activeMode: "day" }, () => this.loadSchedule())
  },

  handleYearMonthTap(event: WechatMiniprogram.TouchEvent) {
    const month = Number(event.currentTarget.dataset.month)
    if (!month) return
    const year = parseDate(this.data.selectedDate).getFullYear()
    this.setData({ selectedDate: `${year}-${pad(month)}-01`, activeMode: "month" }, () => this.loadSchedule())
  },

  handleMealEdit(event: WechatMiniprogram.TouchEvent) {
    const date = String(event.currentTarget.dataset.date || this.data.selectedDate)
    const period = String(event.currentTarget.dataset.period || "") as MealPeriod
    if (!MEAL_DEFINITIONS.some((meal) => meal.key === period)) return
    wx.navigateTo({
      url: `/pages/menu/index?mode=select&date=${date}&period=${period}`
    })
  },

  handleSlotTap(event: WechatMiniprogram.TouchEvent) {
    const mealIndex = Number(event.currentTarget.dataset.mealIndex)
    const slotIndex = Number(event.currentTarget.dataset.slotIndex)
    const meal = this.data.dayMeals[mealIndex]
    const slot = meal?.slots[slotIndex]
    if (!slot?.item) {
      if (meal) this.handleMealEdit({ currentTarget: { dataset: { period: meal.key, date: this.data.selectedDate } } } as unknown as WechatMiniprogram.TouchEvent)
      return
    }
    const dayMeals = this.data.dayMeals.map((section, index) => index === mealIndex
      ? {
        ...section,
        slots: section.slots.map((value, current) => current === slotIndex
          ? { ...value, locked: !value.locked }
          : value)
      }
      : section)
    this.setData({ dayMeals })
  },

  handleResetLocks() {
    const hasLocked = this.data.dayMeals.some((meal) => meal.slots.some((slot) => slot.locked))
    if (!hasLocked) return void wx.showToast({ title: "还没有锁定选项", icon: "none" })
    this.setData({
      dayMeals: this.data.dayMeals.map((meal) => ({
        ...meal,
        slots: meal.slots.map((slot) => ({ ...slot, locked: false }))
      }))
    })
  },

  async handleRandomize() {
    if (!this.data.dishes.length || this.data.saving) {
      if (!this.data.dishes.length) wx.showToast({ title: "暂无可随机的选项", icon: "none" })
      return
    }
    const usedAcrossDay = new Set<string>()
    this.data.dayMeals.forEach((meal) => meal.slots.forEach((slot) => {
      if (slot.locked && slot.item?.dish_id) usedAcrossDay.add(slot.item.dish_id)
    }))
    const nextMeals = this.data.dayMeals.map((meal) => {
      if (meal.key === "afternoon_tea") return meal
      const pool = this.data.dishes.filter((dish) => mealPeriodsFor(dish).includes(meal.key))
      const usedInMeal = new Set<string>()
      const slots = meal.slots.map((slot, index) => {
        if (slot.locked && slot.item) {
          if (slot.item.dish_id) usedInMeal.add(slot.item.dish_id)
          return slot
        }
        const previousId = slot.item?.dish_id || ""
        let candidates = pool.filter((dish) =>
          !usedAcrossDay.has(dish.id) && !usedInMeal.has(dish.id) && dish.id !== previousId
        )
        if (!candidates.length) candidates = pool.filter((dish) => !usedInMeal.has(dish.id) && dish.id !== previousId)
        if (!candidates.length) candidates = pool.filter((dish) => !usedInMeal.has(dish.id))
        const dish = pickRandom(candidates)
        if (!dish) return { ...slot, item: null, locked: false }
        usedAcrossDay.add(dish.id)
        usedInMeal.add(dish.id)
        return { ...slot, item: temporaryScheduleItem(dish, index), locked: false }
      })
      return { ...meal, slots }
    })
    this.setData({ dayMeals: nextMeals, saving: true })
    try {
      await Promise.all(nextMeals
        .filter((meal) => meal.key !== "afternoon_tea")
        .map((meal) => replaceMenuScheduleMeal({
          mealDate: this.data.selectedDate,
          mealPeriod: meal.key,
          slotCount: meal.slotCount,
          items: scheduleInputsFromSlots(meal.slots)
        })))
      if (!isAsyncPageActive(this)) return
      wx.showToast({ title: "随机菜单已保存", icon: "success" })
      await this.loadSchedule()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "随机失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  async handleAddSlot(event: WechatMiniprogram.TouchEvent) {
    const mealIndex = Number(event.currentTarget.dataset.mealIndex)
    const meal = this.data.dayMeals[mealIndex]
    if (!meal || meal.slotCount >= 12 || this.data.saving) return
    await this.saveSlotChange(meal, meal.slotCount + 1)
  },

  handleRemoveSlotRequest(event: WechatMiniprogram.TouchEvent) {
    const mealIndex = Number(event.currentTarget.dataset.mealIndex)
    const meal = this.data.dayMeals[mealIndex]
    if (!meal || meal.slotCount <= 1 || this.data.saving) return
    this.setData({ showRemoveDialog: true, removeMealIndex: mealIndex })
  },

  handleRemoveCancel() {
    this.setData({ showRemoveDialog: false, removeMealIndex: -1 })
  },

  async handleRemoveConfirm() {
    const meal = this.data.dayMeals[this.data.removeMealIndex]
    this.setData({ showRemoveDialog: false, removeMealIndex: -1 })
    if (meal) await this.saveSlotChange(meal, meal.slotCount - 1)
  },

  async saveSlotChange(meal: MealSection, slotCount: number) {
    this.setData({ saving: true })
    try {
      await replaceMenuScheduleMeal({
        mealDate: this.data.selectedDate,
        mealPeriod: meal.key,
        slotCount,
        items: scheduleInputsFromSlots(meal.slots.slice(0, slotCount))
      })
      if (isAsyncPageActive(this)) await this.loadSchedule()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleRanking() {
    const dimension = this.data.activeMode === "day" ? "week" : this.data.activeMode
    wx.navigateTo({
      url: `/pages/menu/ranking/index?dimension=${dimension}&date=${this.data.selectedDate}`
    })
  }
})

import { getCurrentUser } from "../../../services/auth"
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
import { requireLoginForAction } from "../../../utils/login-required"
import { getMenuDataRevision } from "../../../utils/menu-data-revision"
import {
  cacheMenuDishes,
  cacheMenuScheduleRange,
  getCachedMenuDishes,
  getCachedMenuScheduleRange,
  updateCachedMenuScheduleMeal
} from "../../../utils/menu-data-store"

type TimeMode = "day" | "week"

type PlanItem = {
  key: string
  item: MenuScheduleItem
}

type MealSection = {
  key: MealPeriod
  label: string
  items: PlanItem[]
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

type WeekRailItem = {
  key: "previous" | "current" | "next"
  direction: -1 | 0 | 1
  label: string
  rangeLabel: string
  selected: boolean
  ariaLabel: string
}

type ScheduleInputItem =
  | { source_kind: "dish"; dish_id: string }
  | { source_kind: "place"; place_id: string }
  | { archived_item_id: string }

const DEFAULT_RANDOM_ITEM_COUNT = 3
const DEFAULT_MEAL_PERIODS: MealPeriod[] = ["lunch", "dinner"]
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]
const MEAL_DEFINITIONS: Array<Pick<MealSection, "key" | "label">> = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "afternoon_tea", label: "下午茶" },
  { key: "dinner", label: "晚餐" }
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

function startOfWeek(value: string): string {
  const date = parseDate(value)
  const offset = date.getDay() === 0 ? -6 : 1 - date.getDay()
  date.setDate(date.getDate() + offset)
  return formatDate(date)
}

function rangeFor(mode: TimeMode, anchor: string): { start: string; end: string } {
  if (mode === "day") return { start: anchor, end: anchor }
  const start = startOfWeek(anchor)
  return { start, end: addDays(start, 6) }
}

function shortWeekRange(anchor: string): string {
  const range = rangeFor("week", anchor)
  const start = parseDate(range.start)
  const end = parseDate(range.end)
  return `${start.getMonth() + 1}.${start.getDate()}—${end.getMonth() + 1}.${end.getDate()}`
}

function shortDayLabel(anchor: string): string {
  const date = parseDate(anchor)
  return `${date.getMonth() + 1}.${date.getDate()} · 周${WEEKDAYS[date.getDay()]}`
}

function toDayRailItems(anchor: string): WeekRailItem[] {
  const today = formatDate(new Date())
  const dayOffset = Math.round(
    (parseDate(anchor).getTime() - parseDate(today).getTime()) / (24 * 60 * 60 * 1000)
  )
  const currentLabel = dayOffset === 0
    ? "今天"
    : dayOffset > 0
      ? `后${dayOffset}天`
      : `前${Math.abs(dayOffset)}天`
  return [
    {
      key: "previous",
      direction: -1,
      label: "上一天",
      rangeLabel: shortDayLabel(addDays(anchor, -1)),
      selected: false,
      ariaLabel: "切换到上一天"
    },
    {
      key: "current",
      direction: 0,
      label: currentLabel,
      rangeLabel: shortDayLabel(anchor),
      selected: true,
      ariaLabel: `当前查看${currentLabel}`
    },
    {
      key: "next",
      direction: 1,
      label: "下一天",
      rangeLabel: shortDayLabel(addDays(anchor, 1)),
      selected: false,
      ariaLabel: "切换到下一天"
    }
  ]
}

function toWeekRailItems(anchor: string): WeekRailItem[] {
  const selectedWeek = startOfWeek(anchor)
  const currentWeek = startOfWeek(formatDate(new Date()))
  const weekOffset = Math.round(
    (parseDate(selectedWeek).getTime() - parseDate(currentWeek).getTime()) / (7 * 24 * 60 * 60 * 1000)
  )
  const currentLabel = weekOffset === 0
    ? "本周"
    : weekOffset > 0
      ? `后${weekOffset}周`
      : `前${Math.abs(weekOffset)}周`
  return [
    {
      key: "previous",
      direction: -1,
      label: "上一周",
      rangeLabel: shortWeekRange(addDays(selectedWeek, -7)),
      selected: false,
      ariaLabel: "切换到上一周"
    },
    {
      key: "current",
      direction: 0,
      label: currentLabel,
      rangeLabel: shortWeekRange(selectedWeek),
      selected: true,
      ariaLabel: `当前查看${currentLabel}`
    },
    {
      key: "next",
      direction: 1,
      label: "下一周",
      rangeLabel: shortWeekRange(addDays(selectedWeek, 7)),
      selected: false,
      ariaLabel: "切换到下一周"
    }
  ]
}

function mealFor(meals: MenuScheduleMeal[], date: string, period: MealPeriod): MenuScheduleMeal | undefined {
  return meals.find((meal) => meal.meal_date === date && meal.meal_period === period)
}

function toPlanItems(
  items: MenuScheduleItem[],
  date: string,
  period: MealPeriod
): PlanItem[] {
  return items.map((item, index) => ({
    key: `${date}:${period}:${item.id || index}`,
    item
  }))
}

function toMealSections(meals: MenuScheduleMeal[], date: string): MealSection[] {
  return MEAL_DEFINITIONS.map((definition) => {
    const meal = mealFor(meals, date, definition.key)
    return {
      ...definition,
      items: toPlanItems(meal?.items || [], date, definition.key)
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

function hasSamePlanItems(left: PlanItem[], right: PlanItem[]): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const other = right[index]
    return Boolean(other)
      && entry.item.id === other.item.id
      && entry.item.name === other.item.name
      && entry.item.image_url === other.item.image_url
      && entry.item.place_image_url === other.item.place_image_url
  })
}

function hasSameWeekMeal(
  left: WeekDay["meals"][number],
  right: WeekDay["meals"][number]
): boolean {
  return left.items.length === right.items.length && left.items.every((entry, index) => {
    const other = right.items[index]
    return Boolean(other)
      && entry.key === other.key
      && entry.name === other.name
      && entry.imageUrl === other.imageUrl
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
    image_url: dish.image_url,
    place_image_url: "",
    position,
    archived: false
  }
}

function scheduleInputsFromItems(planItems: PlanItem[]): ScheduleInputItem[] {
  const items: ScheduleInputItem[] = []
  planItems.forEach((planItem) => {
    if (planItem.item.archived) {
      items.push({ archived_item_id: planItem.item.id })
    } else if (planItem.item.source_kind === "dish" && planItem.item.dish_id) {
      items.push({ source_kind: "dish", dish_id: planItem.item.dish_id })
    } else if (planItem.item.source_kind === "place" && planItem.item.place_id) {
      items.push({ source_kind: "place", place_id: planItem.item.place_id })
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

Component({
  data: {
    activeMode: "day" as TimeMode,
    selectedDate: formatDate(new Date()),
    dayRailItems: toDayRailItems(formatDate(new Date())),
    weekRailItems: toWeekRailItems(formatDate(new Date())),
    meals: [] as MenuScheduleMeal[],
    dayMeals: [] as MealSection[],
    weekDays: [] as WeekDay[],
    dishes: [] as Dish[],
    loading: true,
    saving: false,
    randomizing: false,
    hasLoaded: false,
    loadedRevision: -1,
    guestMode: false,
    errorMessage: ""
  },

  lifetimes: {
    attached() {
      activateAsyncPage(this)
      if (!getCurrentUser()) {
        this.showGuestPlan()
        return
      }
      this.loadInitialData()
    },

    detached() {
      deactivateAsyncPage(this)
    }
  },

  pageLifetimes: {
    show() {
      activateAsyncPage(this)
      if (!getCurrentUser()) {
        if (!this.data.guestMode) this.showGuestPlan()
        return
      }
      if (this.data.guestMode) {
        this.setData({ guestMode: false, hasLoaded: false })
        this.loadInitialData()
        return
      }
      if (!this.data.hasLoaded) return
      if (this.data.loadedRevision !== getMenuDataRevision() || !this.restoreScheduleFromStore(true)) {
        this.loadInitialData()
      }
    }
  },

  methods: {

  showGuestPlan() {
    this.applySchedule([])
    this.setData({
      dishes: [],
      loading: false,
      hasLoaded: true,
      loadedRevision: getMenuDataRevision(),
      guestMode: true,
      errorMessage: ""
    })
  },

  async loadInitialData() {
    const currentUser = getCurrentUser()
    if (!currentUser) return
    const generation = beginAsyncPageRequest(this)
    const revision = getMenuDataRevision()
    const range = rangeFor(this.data.activeMode, this.data.selectedDate)
    const cachedDishes = getCachedMenuDishes(currentUser.uid, revision)
    const cachedMeals = getCachedMenuScheduleRange(currentUser.uid, revision, range.start, range.end)
    const showInitialLoading = !cachedMeals && !this.data.hasLoaded
    if (cachedMeals) {
      this.applySchedule(cachedMeals)
      this.setData({
        dishes: cachedDishes || this.data.dishes,
        loading: !cachedDishes,
        hasLoaded: true,
        loadedRevision: revision,
        errorMessage: ""
      })
    } else {
      this.setData({ loading: true, errorMessage: "" })
    }
    try {
      const [dishes, schedule] = await Promise.all([
        cachedDishes ? Promise.resolve(cachedDishes) : listAllDishes(),
        cachedMeals
          ? Promise.resolve({ start: range.start, end: range.end, meals: cachedMeals })
          : getMenuScheduleRange(range.start, range.end),
        initializeUIFont().catch(() => undefined)
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      if (!cachedDishes) cacheMenuDishes(currentUser.uid, revision, dishes)
      if (!cachedMeals) {
        cacheMenuScheduleRange(currentUser.uid, revision, schedule.start, schedule.end, schedule.meals)
      }
      this.setData({ dishes, loadedRevision: revision })
      this.applySchedule(schedule.meals)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "本周菜单加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, hasLoaded: true })
      }
    }
  },

  async loadSchedule(existingGeneration?: number) {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      this.applySchedule([])
      return
    }
    const range = rangeFor(this.data.activeMode, this.data.selectedDate)
    const revision = getMenuDataRevision()
    const cachedMeals = getCachedMenuScheduleRange(currentUser.uid, revision, range.start, range.end)
    if (cachedMeals) {
      this.applySchedule(cachedMeals)
      this.setData({ loading: false, hasLoaded: true, loadedRevision: revision, errorMessage: "" })
      return
    }
    const generation = existingGeneration || beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    if (!existingGeneration) this.setData({ loading: true, errorMessage: "" })
    try {
      const result = await getMenuScheduleRange(range.start, range.end)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      cacheMenuScheduleRange(currentUser.uid, revision, result.start, result.end, result.meals)
      this.applySchedule(result.meals)
      this.setData({ loadedRevision: revision })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        const message = error instanceof Error ? error.message : "本周菜单加载失败"
        if (showInitialLoading) this.setData({ errorMessage: message })
        else wx.showToast({ title: message, icon: "none" })
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
      dayRailItems: toDayRailItems(this.data.selectedDate),
      weekRailItems: toWeekRailItems(this.data.selectedDate),
      dayMeals: toMealSections(meals, this.data.selectedDate),
      weekDays: toWeekDays(meals, this.data.selectedDate)
    })
  },

  applyScheduleSilently(meals: MenuScheduleMeal[]) {
    const patch: WechatMiniprogram.IAnyObject = {}
    if (this.data.activeMode === "day") {
      const nextMeals = toMealSections(meals, this.data.selectedDate)
      if (this.data.dayMeals.length !== nextMeals.length) {
        this.applySchedule(meals)
        return
      }
      nextMeals.forEach((meal, mealIndex) => {
        if (!hasSamePlanItems(this.data.dayMeals[mealIndex]?.items || [], meal.items)) {
          patch[`dayMeals[${mealIndex}].items`] = meal.items
        }
      })
    } else {
      const nextDays = toWeekDays(meals, this.data.selectedDate)
      if (this.data.weekDays.length !== nextDays.length) {
        this.applySchedule(meals)
        return
      }
      nextDays.forEach((day, dayIndex) => {
        day.meals.forEach((meal, mealIndex) => {
          const currentMeal = this.data.weekDays[dayIndex]?.meals[mealIndex]
          if (!currentMeal || !hasSameWeekMeal(currentMeal, meal)) {
            patch[`weekDays[${dayIndex}].meals[${mealIndex}]`] = meal
          }
        })
      })
    }
    if (Object.keys(patch).length) this.setData(patch)
  },

  restoreScheduleFromStore(silent = false): boolean {
    const currentUser = getCurrentUser()
    if (!currentUser) return false
    const revision = getMenuDataRevision()
    const range = rangeFor(this.data.activeMode, this.data.selectedDate)
    const meals = getCachedMenuScheduleRange(currentUser.uid, revision, range.start, range.end)
    if (!meals) return false
    if (silent) this.applyScheduleSilently(meals)
    else this.applySchedule(meals)
    const patch: WechatMiniprogram.IAnyObject = {}
    const dishes = getCachedMenuDishes(currentUser.uid, revision)
    if (dishes && !this.data.dishes.length) patch.dishes = dishes
    if (this.data.loading) patch.loading = false
    if (!this.data.hasLoaded) patch.hasLoaded = true
    if (this.data.loadedRevision !== revision) patch.loadedRevision = revision
    if (this.data.errorMessage) patch.errorMessage = ""
    if (Object.keys(patch).length) this.setData(patch)
    return true
  },

  handleRetry() {
    this.loadInitialData()
  },

  handleModeTap(event: WechatMiniprogram.TouchEvent) {
    const mode = String(event.currentTarget.dataset.mode || "day") as TimeMode
    if (!["day", "week"].includes(mode) || mode === this.data.activeMode) return
    this.setData({ activeMode: mode }, () => this.loadSchedule())
  },

  handlePeriodMove(event: WechatMiniprogram.TouchEvent) {
    const rawDirection = Number(event.currentTarget.dataset.direction)
    if (rawDirection === 0) return
    const direction = rawDirection < 0 ? -1 : 1
    const selectedDate = addDays(
      this.data.selectedDate,
      this.data.activeMode === "day" ? direction : direction * 7
    )
    this.setData({
      selectedDate,
      dayRailItems: toDayRailItems(selectedDate),
      weekRailItems: toWeekRailItems(selectedDate)
    }, () => this.loadSchedule())
  },

  handleMealEdit(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this)) return
    const date = String(event.currentTarget.dataset.date || this.data.selectedDate)
    const period = String(event.currentTarget.dataset.period || "") as MealPeriod
    if (!MEAL_DEFINITIONS.some((meal) => meal.key === period)) return
    wx.navigateTo({
      url: `/pages/menu/index?mode=select&date=${date}&period=${period}`
    })
  },

  async handleRandomize() {
    if (!requireLoginForAction(this)) return
    if (!this.data.dishes.length || this.data.saving) {
      if (!this.data.dishes.length) wx.showToast({ title: "暂无可随机的选项", icon: "none" })
      return
    }
    const usedAcrossDay = new Set<string>()
    this.data.dayMeals.forEach((meal) => meal.items.forEach((planItem) => {
      if (planItem.item.dish_id) usedAcrossDay.add(planItem.item.dish_id)
    }))
    const nextMeals = this.data.dayMeals.map((meal) => {
      if (meal.key === "afternoon_tea" || meal.items.length >= DEFAULT_RANDOM_ITEM_COUNT) return meal
      const pool = this.data.dishes.filter((dish) => mealPeriodsFor(dish).includes(meal.key))
      const usedInMeal = new Set(
        meal.items.flatMap((planItem) => planItem.item.dish_id ? [planItem.item.dish_id] : [])
      )
      const additions: PlanItem[] = []
      const randomAdditionCount = DEFAULT_RANDOM_ITEM_COUNT - meal.items.length
      for (let index = 0; index < randomAdditionCount; index += 1) {
        let candidates = pool.filter((dish) =>
          !usedAcrossDay.has(dish.id) && !usedInMeal.has(dish.id)
        )
        if (!candidates.length) candidates = pool.filter((dish) => !usedInMeal.has(dish.id))
        const dish = pickRandom(candidates)
        if (!dish) break
        usedAcrossDay.add(dish.id)
        usedInMeal.add(dish.id)
        additions.push({
          key: `${this.data.selectedDate}:${meal.key}:random:${meal.items.length + index}`,
          item: temporaryScheduleItem(dish, meal.items.length + index)
        })
      }
      return additions.length ? { ...meal, items: [...meal.items, ...additions] } : meal
    })
    const changedMeals = nextMeals.filter((meal, index) => (
      meal.key !== "afternoon_tea"
      && meal.items.length > this.data.dayMeals[index].items.length
    ))
    if (!changedMeals.length) {
      wx.showToast({ title: "每餐已安排三项", icon: "none" })
      return
    }
    const previousMeals = this.data.dayMeals.map((meal) => ({
      ...meal,
      items: [...meal.items]
    }))
    const optimisticPatch: WechatMiniprogram.IAnyObject = {
      saving: true,
      randomizing: true
    }
    changedMeals.forEach((meal) => {
      const mealIndex = nextMeals.findIndex((item) => item.key === meal.key)
      if (mealIndex >= 0) optimisticPatch[`dayMeals[${mealIndex}].items`] = meal.items
    })
    this.setData(optimisticPatch)
    try {
      const savedMeals = await Promise.all(changedMeals.map((meal) => replaceMenuScheduleMeal({
          mealDate: this.data.selectedDate,
          mealPeriod: meal.key,
          items: scheduleInputsFromItems(meal.items)
        })))
      if (!isAsyncPageActive(this)) return
      const currentUser = getCurrentUser()
      if (currentUser) {
        const revision = getMenuDataRevision()
        savedMeals.forEach((meal) => updateCachedMenuScheduleMeal(currentUser.uid, revision, meal))
      }
      const savedPatch: WechatMiniprogram.IAnyObject = {}
      savedMeals.forEach((meal) => {
        const mealIndex = this.data.dayMeals.findIndex((item) => item.key === meal.meal_period)
        if (mealIndex >= 0) {
          savedPatch[`dayMeals[${mealIndex}].items`] = toPlanItems(
            meal.items,
            this.data.selectedDate,
            meal.meal_period
          )
        }
      })
      this.setData(savedPatch)
      wx.showToast({ title: "已补充随机菜品", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ dayMeals: previousMeals })
        wx.showToast({ title: error instanceof Error ? error.message : "随机失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false, randomizing: false })
    }
  },

  async handleRemoveMealItem(event: WechatMiniprogram.TouchEvent) {
    if (!requireLoginForAction(this) || this.data.saving) return
    const mealIndex = Number(event.currentTarget.dataset.mealIndex)
    const itemIndex = Number(event.currentTarget.dataset.itemIndex)
    const meal = this.data.dayMeals[mealIndex]
    if (!meal?.items[itemIndex]) return
    const previousItems = meal.items
    const nextMeal = {
      ...meal,
      items: meal.items.filter((_item, index) => index !== itemIndex)
    }
    this.setData({
      [`dayMeals[${mealIndex}].items`]: nextMeal.items,
      saving: true
    })
    try {
      const savedMeal = await replaceMenuScheduleMeal({
        mealDate: this.data.selectedDate,
        mealPeriod: meal.key,
        items: scheduleInputsFromItems(nextMeal.items)
      })
      if (isAsyncPageActive(this)) {
        const currentUser = getCurrentUser()
        if (currentUser) {
          updateCachedMenuScheduleMeal(currentUser.uid, getMenuDataRevision(), savedMeal)
        }
        this.setData({
          [`dayMeals[${mealIndex}].items`]: toPlanItems(
            savedMeal.items,
            this.data.selectedDate,
            savedMeal.meal_period
          )
        })
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ [`dayMeals[${mealIndex}].items`]: previousItems })
        wx.showToast({ title: error instanceof Error ? error.message : "移除失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleRanking() {
    wx.navigateTo({
      url: `/pages/menu/ranking/index?dimension=week&date=${this.data.selectedDate}`
    })
  }
  }
})

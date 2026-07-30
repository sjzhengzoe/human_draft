import { ensureLogin } from "../../../services/auth"
import { listDishes } from "../../../services/menu"
import type { Dish, MealPeriod } from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type PlanSlot = {
  key: string
  dish: Dish | null
  locked: boolean
}

type MealSection = {
  key: MealPeriod
  label: string
  englishLabel: string
  availableCount: number
  slots: PlanSlot[]
}

const SLOT_COUNT = 3
const DEFAULT_MEAL_PERIODS: MealPeriod[] = ["lunch", "dinner"]
const MEAL_DEFINITIONS: Array<Pick<MealSection, "key" | "label" | "englishLabel">> = [
  { key: "breakfast", label: "早餐", englishLabel: "GOOD MORNING" },
  { key: "lunch", label: "午餐", englishLabel: "LUNCH TIME" },
  { key: "dinner", label: "晚餐", englishLabel: "DINNER TIME" }
]

function createEmptyMeals(): MealSection[] {
  return MEAL_DEFINITIONS.map((meal) => ({
    ...meal,
    availableCount: 0,
    slots: Array.from({ length: SLOT_COUNT }, (_value, index) => ({
      key: `${meal.key}-${index}`,
      dish: null,
      locked: false
    }))
  }))
}

function mealPeriodsFor(dish: Dish): MealPeriod[] {
  return Array.isArray(dish.meal_periods) && dish.meal_periods.length > 0
    ? dish.meal_periods
    : DEFAULT_MEAL_PERIODS
}

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

function fillUnlockedSlots(meals: MealSection[], dishes: Dish[]): MealSection[] {
  const usedAcrossDay = new Set<string>()

  meals.forEach((meal) => {
    meal.slots.forEach((slot) => {
      if (slot.locked && slot.dish) usedAcrossDay.add(slot.dish.id)
    })
  })

  return meals.map((meal) => {
    const pool = dishes.filter((dish) => mealPeriodsFor(dish).includes(meal.key))
    const usedInMeal = new Set(
      meal.slots
        .filter((slot) => slot.locked && slot.dish)
        .map((slot) => (slot.dish as Dish).id)
    )

    const slots = meal.slots.map((slot) => {
      if (slot.locked && slot.dish) return slot

      const previousId = slot.dish?.id || ""
      let candidates = pool.filter(
        (dish) =>
          !usedAcrossDay.has(dish.id)
          && !usedInMeal.has(dish.id)
          && dish.id !== previousId
      )

      if (candidates.length === 0) {
        candidates = pool.filter(
          (dish) => !usedInMeal.has(dish.id) && dish.id !== previousId
        )
      }
      if (candidates.length === 0) {
        candidates = pool.filter((dish) => !usedInMeal.has(dish.id))
      }

      const dish = pickRandom(candidates) || null
      if (dish) {
        usedAcrossDay.add(dish.id)
        usedInMeal.add(dish.id)
      }

      return {
        ...slot,
        dish,
        locked: false
      }
    })

    return {
      ...meal,
      availableCount: pool.length,
      slots
    }
  })
}

async function listAllDishes(): Promise<Dish[]> {
  const dishes: Dish[] = []
  let page = 1

  while (page <= 20) {
    const batch = await listDishes({
      sort: "custom",
      page,
      page_size: 100
    })
    dishes.push(...batch)
    if (batch.length < 100) break
    page += 1
  }

  return dishes
}

function formatToday(): string {
  const today = new Date()
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]
  return `${today.getMonth() + 1}月${today.getDate()}日 · 星期${weekdays[today.getDay()]}`
}

Page({
  data: {
    meals: createEmptyMeals(),
    dishes: [] as Dish[],
    todayLabel: formatToday(),
    loading: true,
    hasLoaded: false,
    errorMessage: ""
  },

  onLoad() {
    activateAsyncPage(this)
    this.loadData()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadData() {
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true, errorMessage: "" })

    try {
      await ensureLogin()
      const dishes = await listAllDishes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        dishes,
        meals: fillUnlockedSlots(createEmptyMeals(), dishes),
        hasLoaded: true
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.setData({
        errorMessage: error instanceof Error ? error.message : "一日三餐加载失败"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleRetry() {
    this.loadData()
  },

  handleSlotTap(event: WechatMiniprogram.TouchEvent) {
    const mealIndex = Number(event.currentTarget.dataset.mealIndex)
    const slotIndex = Number(event.currentTarget.dataset.slotIndex)
    const meals = this.data.meals.map((meal) => ({
      ...meal,
      slots: meal.slots.map((slot) => ({ ...slot }))
    }))
    const slot = meals[mealIndex]?.slots[slotIndex]
    if (!slot?.dish) return
    slot.locked = !slot.locked
    this.setData({ meals })
  },

  handleResetLocks() {
    const hasLockedDish = this.data.meals.some((meal) =>
      meal.slots.some((slot) => slot.locked)
    )
    if (!hasLockedDish) {
      wx.showToast({ title: "还没有锁定菜品", icon: "none" })
      return
    }

    this.setData({
      meals: this.data.meals.map((meal) => ({
        ...meal,
        slots: meal.slots.map((slot) => ({ ...slot, locked: false }))
      }))
    })
    wx.showToast({ title: "已全部解锁", icon: "success" })
  },

  handleRandomize() {
    if (this.data.dishes.length === 0) {
      wx.showToast({ title: "暂无可随机的菜品", icon: "none" })
      return
    }
    const hasUnlockedSlot = this.data.meals.some((meal) =>
      meal.slots.some((slot) => !slot.locked)
    )
    if (!hasUnlockedSlot) {
      wx.showToast({ title: "所有菜品都已锁定", icon: "none" })
      return
    }
    this.setData({
      meals: fillUnlockedSlots(this.data.meals, this.data.dishes)
    })
  }
})

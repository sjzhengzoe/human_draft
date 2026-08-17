import type {
  Category,
  Dish,
  MenuPlace,
  MenuScheduleMeal
} from "../types/api"
import type { DiningScene } from "../types/dining"

export type MenuDataMetadata = {
  categories: Category[]
  outsideCategories: DiningScene[]
  homePlaceId: string
  canWrite: boolean
}

export type MenuDataContent = {
  dishes: Dish[]
  outsidePlaces: MenuPlace[]
}

type CachedValue<T> = {
  value: T
}

type MenuDataStore = {
  userId: string
  revision: number
  metadata: CachedValue<MenuDataMetadata> | null
  contentByFilter: Map<string, CachedValue<MenuDataContent>>
  placesById: Map<string, MenuPlace>
  allDishes: Dish[] | null
  scheduleByDate: Map<string, MenuScheduleMeal[]>
  loadedScheduleDates: Set<string>
}

let store: MenuDataStore | null = null

function cloneCategory(category: Category): Category {
  return { ...category }
}

function cloneDish(dish: Dish): Dish {
  return {
    ...dish,
    category: dish.category ? { ...dish.category } : null,
    outside_category: dish.outside_category ? { ...dish.outside_category } : null,
    main_ingredients: [...dish.main_ingredients],
    cooking_methods: [...dish.cooking_methods],
    flavor_options: [...dish.flavor_options],
    meal_periods: [...dish.meal_periods]
  }
}

function clonePlaceDish(dish: MenuPlace["dishes"][number]): MenuPlace["dishes"][number] {
  return {
    ...dish,
    main_ingredients: [...dish.main_ingredients],
    cooking_methods: [...dish.cooking_methods]
  }
}

function cloneMenuPlace(place: MenuPlace): MenuPlace {
  return {
    ...place,
    outside_category: place.outside_category ? { ...place.outside_category } : null,
    dishes: place.dishes.map(clonePlaceDish),
    preview_dishes: place.preview_dishes.map(clonePlaceDish)
  }
}

function cloneMetadata(metadata: MenuDataMetadata): MenuDataMetadata {
  return {
    ...metadata,
    categories: metadata.categories.map(cloneCategory),
    outsideCategories: metadata.outsideCategories.map((category) => ({ ...category }))
  }
}

function cloneContent(content: MenuDataContent): MenuDataContent {
  return {
    dishes: content.dishes.map(cloneDish),
    outsidePlaces: content.outsidePlaces.map(cloneMenuPlace)
  }
}

function cloneScheduleMeal(meal: MenuScheduleMeal): MenuScheduleMeal {
  return {
    ...meal,
    items: meal.items.map((item) => ({ ...item }))
  }
}

function datesInRange(start: string, end: string): string[] {
  if (start > end) return []
  const dates: string[] = []
  const current = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (
    Number.isFinite(current.getTime())
    && Number.isFinite(last.getTime())
    && current <= last
    && dates.length <= 366
  ) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
  }
  return dates
}

function matchesScope(userId: string, revision: number): boolean {
  return Boolean(store && store.userId === userId && store.revision === revision)
}

function ensureScope(userId: string, revision: number): MenuDataStore {
  if (!matchesScope(userId, revision)) {
    store = {
      userId,
      revision,
      metadata: null,
      contentByFilter: new Map(),
      placesById: new Map(),
      allDishes: null,
      scheduleByDate: new Map(),
      loadedScheduleDates: new Set()
    }
  }
  return store as MenuDataStore
}

export function getCachedMenuMetadata(
  userId: string,
  revision: number
): CachedValue<MenuDataMetadata> | null {
  if (!matchesScope(userId, revision) || !store?.metadata) return null
  return {
    value: cloneMetadata(store.metadata.value)
  }
}

export function getCachedMenuContent(
  userId: string,
  revision: number,
  activeFilter: string
): CachedValue<MenuDataContent> | null {
  if (!matchesScope(userId, revision)) return null
  const cached = store?.contentByFilter.get(activeFilter)
  return cached
    ? { value: cloneContent(cached.value) }
    : null
}

export function cacheMenuMetadata(
  userId: string,
  revision: number,
  metadata: MenuDataMetadata
): void {
  ensureScope(userId, revision).metadata = {
    value: cloneMetadata(metadata)
  }
}

export function cacheMenuContent(
  userId: string,
  revision: number,
  activeFilter: string,
  content: MenuDataContent
): void {
  const currentStore = ensureScope(userId, revision)
  currentStore.contentByFilter.set(activeFilter, {
    value: cloneContent(content)
  })
  if (activeFilter === "all") {
    currentStore.allDishes = content.dishes.map(cloneDish)
  }
  content.outsidePlaces.forEach((place) => {
    currentStore.placesById.set(place.id, cloneMenuPlace(place))
  })
}

export function getCachedMenuPlace(
  userId: string,
  revision: number,
  placeId: string
): MenuPlace | null {
  if (!matchesScope(userId, revision)) return null
  const place = store?.placesById.get(placeId)
  return place ? cloneMenuPlace(place) : null
}

export function cacheMenuPlace(
  userId: string,
  revision: number,
  place: MenuPlace
): void {
  ensureScope(userId, revision).placesById.set(place.id, cloneMenuPlace(place))
}

export function getCachedMenuDishes(
  userId: string,
  revision: number
): Dish[] | null {
  if (!matchesScope(userId, revision) || !store?.allDishes) return null
  return store.allDishes.map(cloneDish)
}

export function cacheMenuDishes(
  userId: string,
  revision: number,
  dishes: Dish[]
): void {
  ensureScope(userId, revision).allDishes = dishes.map(cloneDish)
}

export function getCachedMenuScheduleRange(
  userId: string,
  revision: number,
  start: string,
  end: string
): MenuScheduleMeal[] | null {
  if (!matchesScope(userId, revision) || !store) return null
  const dates = datesInRange(start, end)
  if (!dates.length || dates.some((date) => !store?.loadedScheduleDates.has(date))) return null
  return dates.flatMap((date) => (
    store?.scheduleByDate.get(date)?.map(cloneScheduleMeal) || []
  ))
}

export function cacheMenuScheduleRange(
  userId: string,
  revision: number,
  start: string,
  end: string,
  meals: MenuScheduleMeal[]
): void {
  const currentStore = ensureScope(userId, revision)
  const dates = datesInRange(start, end)
  dates.forEach((date) => {
    currentStore.loadedScheduleDates.add(date)
    currentStore.scheduleByDate.set(date, [])
  })
  meals.forEach((meal) => {
    if (!currentStore.loadedScheduleDates.has(meal.meal_date)) return
    const dateMeals = currentStore.scheduleByDate.get(meal.meal_date) || []
    dateMeals.push(cloneScheduleMeal(meal))
    currentStore.scheduleByDate.set(meal.meal_date, dateMeals)
  })
}

export function updateCachedMenuScheduleMeal(
  userId: string,
  revision: number,
  meal: MenuScheduleMeal
): boolean {
  if (!matchesScope(userId, revision) || !store?.loadedScheduleDates.has(meal.meal_date)) {
    return false
  }
  const dateMeals = store.scheduleByDate.get(meal.meal_date) || []
  store.scheduleByDate.set(meal.meal_date, [
    ...dateMeals.filter((item) => item.meal_period !== meal.meal_period),
    cloneScheduleMeal(meal)
  ])
  return true
}

export function clearMenuDataStore(): void {
  store = null
}

import type {
  Category,
  Dish,
  MenuPlace
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
      placesById: new Map()
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

export function clearMenuDataStore(): void {
  store = null
}

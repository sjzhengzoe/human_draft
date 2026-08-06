import type {
  Category,
  Dish,
  DishListParams,
  MealPeriod,
  MenuPlace,
  MenuRecordType
} from "../types/api"
import type { DiningScene } from "../types/dining"
import { getCurrentUser } from "./auth"
import { listDiningScenes } from "./dining"
import { ApiRequestError, request, upload } from "./request"
import { markMenuDataChanged } from "../utils/menu-data-revision"

const DEFAULT_MEAL_PERIODS: MealPeriod[] = ["lunch", "dinner"]

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function normalizeDish(dish: Dish): Dish {
  const mealPeriods = normalizeStringArray(dish.meal_periods).filter(
    (item): item is MealPeriod =>
      ["breakfast", "lunch", "afternoon_tea", "dinner"].includes(item)
  )
  return {
    ...dish,
    recommended_items: normalizeStringArray(dish.recommended_items),
    main_ingredients: normalizeStringArray(dish.main_ingredients),
    introduction: typeof dish.introduction === "string" ? dish.introduction : "",
    cooking_methods: normalizeStringArray(dish.cooking_methods),
    taste: typeof dish.taste === "string" ? dish.taste : "",
    flavor_options: normalizeStringArray(dish.flavor_options),
    place_id: typeof dish.place_id === "string" ? dish.place_id : null,
    place_sort_order: Number.isFinite(Number(dish.place_sort_order))
      ? Number(dish.place_sort_order)
      : Number(dish.sort_order || 0),
    meal_periods: mealPeriods.length > 0 ? mealPeriods : [...DEFAULT_MEAL_PERIODS]
  }
}

function normalizeMenuPlace(place: MenuPlace): MenuPlace {
  const normalizePreviewDish = (dish: MenuPlace["dishes"][number]) => ({
    ...dish,
    introduction: typeof dish.introduction === "string" ? dish.introduction : "",
    main_ingredients: normalizeStringArray(dish.main_ingredients),
    cooking_methods: normalizeStringArray(dish.cooking_methods),
    taste: typeof dish.taste === "string" ? dish.taste : "",
    image_url: typeof dish.image_url === "string" ? dish.image_url : "",
    thumbnail_url: typeof dish.thumbnail_url === "string" ? dish.thumbnail_url : ""
  })
  const previewDishes = Array.isArray(place.preview_dishes)
    ? place.preview_dishes.map(normalizePreviewDish)
    : []
  return {
    ...place,
    image_url: typeof place.image_url === "string" ? place.image_url : "",
    thumbnail_url: typeof place.thumbnail_url === "string" ? place.thumbnail_url : "",
    dish_count: Number(place.dish_count || 0),
    dishes: Array.isArray(place.dishes)
      ? place.dishes.map(normalizePreviewDish)
      : previewDishes,
    preview_dishes: previewDishes
  }
}

function toQuery<T extends object>(params: T): string {
  const entries: string[] = []
  Object.entries(params as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      entries.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    }
  })
  return entries.length > 0 ? `?${entries.join("&")}` : ""
}

export async function listCategories(): Promise<Category[]> {
  const data = await request<{ items: Category[] }>({ path: "/api/categories" })
  return data.items
}

export type MenuOverview = {
  categories: Category[]
  outsideCategories: DiningScene[]
  homePlaceId: string
  activeFilter: string
  activeRecordType: MenuRecordType
  dishes: Dish[]
  outsidePlaces: MenuPlace[]
  canWrite: boolean
}

function resolveOverviewCategoryId<T extends { id: string }>(
  requestedId: string | undefined,
  categories: T[]
): string {
  return categories.some((category) => category.id === requestedId)
    ? requestedId || ""
    : categories[0]?.id || ""
}

async function getLegacyMenuOverview(params: {
  record_type: MenuRecordType
  category_id?: string
}): Promise<MenuOverview> {
  const [categories, outsideCategories, homePlaces] = await Promise.all([
    listCategories(),
    listDiningScenes(),
    listMenuPlaces({ place_type: "home", include_dishes: false })
  ])
  const activeCategories = params.record_type === "outside"
    ? outsideCategories
    : categories
  const categoryId = params.record_type === "outside" && params.category_id === undefined
    ? ""
    : resolveOverviewCategoryId(params.category_id, activeCategories)
  const homePlaceId = homePlaces[0]?.id || ""
  const [dishes, outsidePlaces] = params.record_type === "home"
    ? [await listDishes({
      place_id: homePlaceId || undefined,
      category_id: categoryId || undefined,
      record_type: "home",
      sort: "custom",
      page_size: 100
    }), [] as MenuPlace[]]
    : [[], await listMenuPlaces({
      place_type: "outside",
      outside_category_id: categoryId || undefined
    })]
  return {
    categories,
    outsideCategories,
    homePlaceId,
    activeFilter: categoryId ? `${params.record_type}:${categoryId}` : params.record_type,
    activeRecordType: params.record_type,
    dishes,
    outsidePlaces,
    canWrite: getCurrentUser()?.can_write === true
  }
}

export async function getMenuOverview(params: {
  record_type: MenuRecordType
  category_id?: string
}): Promise<MenuOverview> {
  let data: {
      categories: Category[]
      outside_categories: DiningScene[]
      home_place_id: string
      active_filter: string
      active_record_type: MenuRecordType
      dishes: Dish[]
      outside_places: MenuPlace[]
      can_write: boolean
    }
  try {
    data = await request({ path: `/api/menu-overview${toQuery(params)}` })
  } catch (error) {
    if (error instanceof ApiRequestError && error.statusCode === 404) {
      return getLegacyMenuOverview(params)
    }
    throw error
  }
  return {
    categories: Array.isArray(data.categories) ? data.categories : [],
    outsideCategories: Array.isArray(data.outside_categories) ? data.outside_categories : [],
    homePlaceId: typeof data.home_place_id === "string" ? data.home_place_id : "",
    activeFilter: typeof data.active_filter === "string" ? data.active_filter : params.record_type,
    activeRecordType: data.active_record_type === "outside" ? "outside" : "home",
    dishes: Array.isArray(data.dishes) ? data.dishes.map(normalizeDish) : [],
    outsidePlaces: Array.isArray(data.outside_places)
      ? data.outside_places.map(normalizeMenuPlace)
      : [],
    canWrite: data.can_write === true
  }
}

export async function listDishes(params: DishListParams): Promise<Dish[]> {
  const data = await request<{ items: Dish[] }>({
    path: `/api/dishes${toQuery(params)}`
  })
  return Array.isArray(data.items) ? data.items.map(normalizeDish) : []
}

export async function getDish(id: string): Promise<Dish> {
  const data = await request<{ dish: Dish }>({ path: `/api/dishes/${id}` })
  return normalizeDish(data.dish)
}

export async function listMenuPlaces(params: {
  place_type?: MenuRecordType
  outside_category_id?: string
  include_dishes?: boolean
} = {}): Promise<MenuPlace[]> {
  const data = await request<{ items: MenuPlace[] }>({
    path: `/api/menu-places${toQuery(params)}`
  })
  return Array.isArray(data.items) ? data.items.map(normalizeMenuPlace) : []
}

export async function getMenuPlace(id: string): Promise<MenuPlace> {
  const data = await request<{ place: MenuPlace }>({ path: `/api/menu-places/${id}` })
  return normalizeMenuPlace(data.place)
}

export async function createMenuPlace(input: {
  name: string
  outsideCategoryId: string
  imagePath: string
}): Promise<MenuPlace> {
  const data = await upload<{ place: MenuPlace }>({
    path: "/api/menu-places",
    filePath: input.imagePath,
    formData: {
      name: input.name,
      outside_category_id: input.outsideCategoryId
    }
  })
  markMenuDataChanged()
  return normalizeMenuPlace(data.place)
}

export async function updateMenuPlace(
  id: string,
  changes: { name?: string; outside_category_id?: string }
): Promise<MenuPlace> {
  const data = await request<{ place: MenuPlace }>({
    path: `/api/menu-places/${id}`,
    method: "PUT",
    data: changes
  })
  markMenuDataChanged()
  return normalizeMenuPlace(data.place)
}

export async function replaceMenuPlaceImage(id: string, imagePath: string): Promise<MenuPlace> {
  const data = await upload<{ place: MenuPlace }>({
    path: `/api/menu-places/${id}/image`,
    filePath: imagePath
  })
  markMenuDataChanged()
  return normalizeMenuPlace(data.place)
}

export async function deleteMenuPlace(id: string): Promise<void> {
  await request<void>({ path: `/api/menu-places/${id}`, method: "DELETE" })
  markMenuDataChanged()
}

export async function createDish(input: {
  name: string
  recordType: MenuRecordType
  placeId?: string
  categoryId?: string
  outsideCategoryId?: string
  imagePath?: string
  mealPeriods: MealPeriod[]
  recommendedItems?: string[]
  mainIngredients?: string[]
  introduction?: string
  cookingMethods?: string[]
  taste?: string
  flavorOptions?: string[]
}): Promise<Dish> {
  const payload = {
      name: input.name,
      record_type: input.recordType,
      place_id: input.placeId || "",
      category_id: input.categoryId || "",
      outside_category_id: input.outsideCategoryId || "",
      meal_periods: JSON.stringify(input.mealPeriods),
      recommended_items: JSON.stringify(input.recommendedItems || []),
      main_ingredients: JSON.stringify(input.mainIngredients || []),
      introduction: input.introduction || "",
      cooking_methods: JSON.stringify(input.cookingMethods || []),
      taste: input.taste || "",
      flavor_options: JSON.stringify(input.flavorOptions || [])
  }
  const data = input.imagePath
    ? await upload<{ dish: Dish }>({
      path: "/api/dishes",
      filePath: input.imagePath,
      formData: payload
    })
    : await request<{ dish: Dish }>({
      path: "/api/menu-dishes",
      method: "POST",
      data: payload
    })
  markMenuDataChanged()
  return normalizeDish(data.dish)
}

export async function updateDish(
  id: string,
  changes: {
    name?: string
    place_id?: string
    record_type?: MenuRecordType
    category_id?: string | null
    outside_category_id?: string | null
    meal_periods?: MealPeriod[]
    recommended_items?: string[]
    main_ingredients?: string[]
    introduction?: string
    cooking_methods?: string[]
    taste?: string
    flavor_options?: string[]
  }
): Promise<Dish> {
  const data = await request<{ dish: Dish }>({
    path: `/api/dishes/${id}`,
    method: "PUT",
    data: changes
  })
  markMenuDataChanged()
  return normalizeDish(data.dish)
}

export async function replaceDishImage(id: string, imagePath: string): Promise<Dish> {
  const data = await upload<{ dish: Dish }>({
    path: `/api/dishes/${id}/image`,
    filePath: imagePath
  })
  markMenuDataChanged()
  return normalizeDish(data.dish)
}

export async function deleteDish(id: string): Promise<void> {
  await request<void>({ path: `/api/dishes/${id}`, method: "DELETE" })
  markMenuDataChanged()
}

export async function updatePrintStatus(ids: string[], printed: boolean): Promise<{ updated: number }> {
  const result = await request<{ updated: number }>({
    path: "/api/dishes/print-status",
    method: "PUT",
    data: { ids, printed }
  })
  markMenuDataChanged()
  return result
}

export async function reorderDishSortOrders(ids: string[], placeId?: string): Promise<{ updated: number }> {
  const result = await request<{ updated: number }>({
    path: "/api/dishes/reorder",
    method: "PUT",
    data: { ids, place_id: placeId || "" }
  })
  markMenuDataChanged()
  return result
}

export async function reorderMenuPlaceSortOrders(ids: string[]): Promise<{ updated: number }> {
  const result = await request<{ updated: number }>({
    path: "/api/menu-places/reorder",
    method: "PUT",
    data: { ids }
  })
  markMenuDataChanged()
  return result
}

import type {
  Category,
  Dish,
  DishListParams,
  MealPeriod,
  MenuRecordType
} from "../types/api"
import { request, upload } from "./request"

const DEFAULT_MEAL_PERIODS: MealPeriod[] = ["lunch", "dinner"]

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []
}

function normalizeDish(dish: Dish): Dish {
  const mealPeriods = normalizeStringArray(dish.meal_periods).filter(
    (item): item is MealPeriod => ["breakfast", "lunch", "dinner"].includes(item)
  )
  return {
    ...dish,
    recommended_items: normalizeStringArray(dish.recommended_items),
    main_ingredients: normalizeStringArray(dish.main_ingredients),
    introduction: typeof dish.introduction === "string" ? dish.introduction : "",
    cooking_methods: normalizeStringArray(dish.cooking_methods),
    taste: typeof dish.taste === "string" ? dish.taste : "",
    flavor_options: normalizeStringArray(dish.flavor_options),
    meal_periods: mealPeriods.length > 0 ? mealPeriods : [...DEFAULT_MEAL_PERIODS]
  }
}

function toQuery(params: DishListParams): string {
  const entries: string[] = []
  Object.keys(params).forEach((key) => {
    const value = params[key as keyof DishListParams]
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

export async function createDish(input: {
  name: string
  recordType: MenuRecordType
  categoryId?: string
  outsideCategoryId?: string
  imagePath: string
  mealPeriods: MealPeriod[]
  recommendedItems?: string[]
  mainIngredients?: string[]
  introduction?: string
  cookingMethods?: string[]
  taste?: string
  flavorOptions?: string[]
}): Promise<Dish> {
  const data = await upload<{ dish: Dish }>({
    path: "/api/dishes",
    filePath: input.imagePath,
    formData: {
      name: input.name,
      record_type: input.recordType,
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
  })
  return normalizeDish(data.dish)
}

export async function updateDish(
  id: string,
  changes: {
    name?: string
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
  return normalizeDish(data.dish)
}

export async function replaceDishImage(id: string, imagePath: string): Promise<Dish> {
  const data = await upload<{ dish: Dish }>({
    path: `/api/dishes/${id}/image`,
    filePath: imagePath
  })
  return normalizeDish(data.dish)
}

export function deleteDish(id: string): Promise<void> {
  return request<void>({ path: `/api/dishes/${id}`, method: "DELETE" })
}

export function updatePrintStatus(ids: string[], printed: boolean): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/dishes/print-status",
    method: "PUT",
    data: { ids, printed }
  })
}

export function swapDishSortOrders(
  sourceId: string,
  targetId: string
): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/dishes/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

export function reorderDishSortOrders(ids: string[]): Promise<{ updated: number }> {
  return request<{ updated: number }>({ path: "/api/dishes/reorder", method: "PUT", data: { ids } })
}

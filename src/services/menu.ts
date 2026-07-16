import type { Category, Dish, DishListParams } from "../types/api"
import { request, upload } from "./request"

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
  return data.items
}

export async function getDish(id: string): Promise<Dish> {
  const data = await request<{ dish: Dish }>({ path: `/api/dishes/${id}` })
  return data.dish
}

export async function createDish(input: {
  name: string
  categoryId: string
  imagePath: string
}): Promise<Dish> {
  const data = await upload<{ dish: Dish }>({
    path: "/api/dishes",
    filePath: input.imagePath,
    formData: { name: input.name, category_id: input.categoryId }
  })
  return data.dish
}

export async function updateDish(
  id: string,
  changes: { name?: string; category_id?: string }
): Promise<Dish> {
  const data = await request<{ dish: Dish }>({
    path: `/api/dishes/${id}`,
    method: "PUT",
    data: changes
  })
  return data.dish
}

export async function replaceDishImage(id: string, imagePath: string): Promise<Dish> {
  const data = await upload<{ dish: Dish }>({
    path: `/api/dishes/${id}/image`,
    filePath: imagePath
  })
  return data.dish
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

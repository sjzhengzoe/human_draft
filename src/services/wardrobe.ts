import type {
  WardrobeCategory,
  WardrobeField,
  WardrobeItem,
  WardrobeSort
} from "../types/wardrobe"
import { request, upload } from "./request"

function queryString(values: Record<string, string | undefined>): string {
  const parts = Object.keys(values)
    .filter((key) => values[key] !== undefined && values[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key] as string)}`)
  return parts.length ? `?${parts.join("&")}` : ""
}

export async function listWardrobeCategories(): Promise<WardrobeCategory[]> {
  const data = await request<{ items: WardrobeCategory[] }>({
    path: "/api/wardrobe/categories"
  })
  return data.items
}

export async function getWardrobeStats(): Promise<{
  total_items: number
  total_categories: number
  monthly_items: number
}> {
  return request<{
    total_items: number
    total_categories: number
    monthly_items: number
  }>({ path: "/api/wardrobe/stats" })
}

export async function getWardrobeCategory(id: string): Promise<WardrobeCategory> {
  const data = await request<{ item: WardrobeCategory }>({
    path: `/api/wardrobe/categories/${id}`
  })
  return data.item
}

export async function createWardrobeCategory(input: {
  name: string
  fields: Array<Pick<WardrobeField, "name">>
}): Promise<WardrobeCategory> {
  const data = await request<{ item: WardrobeCategory }>({
    path: "/api/wardrobe/categories",
    method: "POST",
    data: input
  })
  return data.item
}

export async function updateWardrobeCategory(
  id: string,
  input: { name: string; fields: WardrobeField[] }
): Promise<WardrobeCategory> {
  const data = await request<{ item: WardrobeCategory }>({
    path: `/api/wardrobe/categories/${id}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export function deleteWardrobeCategory(id: string): Promise<void> {
  return request<void>({
    path: `/api/wardrobe/categories/${id}`,
    method: "DELETE"
  })
}

export function swapWardrobeCategorySortOrders(
  sourceId: string,
  targetId: string
): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/wardrobe/categories/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

export async function listWardrobeItems(input: {
  categoryId?: string
  sort: WardrobeSort
}): Promise<WardrobeItem[]> {
  const data = await request<{ items: WardrobeItem[] }>({
    path: `/api/wardrobe/items${queryString({
      category_id: input.categoryId,
      sort: input.sort
    })}`
  })
  return data.items
}

export async function getWardrobeItem(id: string): Promise<WardrobeItem> {
  const data = await request<{ item: WardrobeItem }>({
    path: `/api/wardrobe/items/${id}`
  })
  return data.item
}

export async function createWardrobeItem(input: {
  name: string
  categoryId: string
  values: Record<string, string>
  imagePath: string
}): Promise<WardrobeItem> {
  const data = await upload<{ item: WardrobeItem }>({
    path: "/api/wardrobe/items",
    filePath: input.imagePath,
    formData: {
      name: input.name,
      category_id: input.categoryId,
      values: JSON.stringify(input.values)
    }
  })
  return data.item
}

export async function updateWardrobeItem(
  id: string,
  input: {
    name: string
    category_id: string
    values: Record<string, string>
  }
): Promise<WardrobeItem> {
  const data = await request<{ item: WardrobeItem }>({
    path: `/api/wardrobe/items/${id}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export async function replaceWardrobeItemImage(
  id: string,
  imagePath: string
): Promise<WardrobeItem> {
  const data = await upload<{ item: WardrobeItem }>({
    path: `/api/wardrobe/items/${id}/image`,
    filePath: imagePath
  })
  return data.item
}

export function deleteWardrobeItem(id: string): Promise<void> {
  return request<void>({ path: `/api/wardrobe/items/${id}`, method: "DELETE" })
}

export function swapWardrobeItemSortOrders(
  sourceId: string,
  targetId: string
): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/wardrobe/items/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

export function reorderWardrobeItemSortOrders(ids: string[]): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/wardrobe/items/reorder",
    method: "PUT",
    data: { ids }
  })
}

import type { DiningScene } from "../types/dining"
import { request } from "./request"
import { markMenuDataChanged } from "../utils/menu-data-revision"

export async function listDiningScenes(): Promise<DiningScene[]> {
  const data = await request<{ items: DiningScene[] }>({ path: "/api/dining-scenes" })
  return data.items
}

export async function getDiningScene(id: string): Promise<DiningScene> {
  const data = await request<{ item: DiningScene }>({ path: `/api/dining-scenes/${id}` })
  return data.item
}

export async function createDiningScene(name: string): Promise<DiningScene> {
  const data = await request<{ item: DiningScene }>({ path: "/api/dining-scenes", method: "POST", data: { name } })
  markMenuDataChanged()
  return data.item
}

export async function updateDiningScene(id: string, name: string): Promise<DiningScene> {
  const data = await request<{ item: DiningScene }>({ path: `/api/dining-scenes/${id}`, method: "PUT", data: { name } })
  markMenuDataChanged()
  return data.item
}

export async function deleteDiningScene(id: string): Promise<void> {
  await request<void>({ path: `/api/dining-scenes/${id}`, method: "DELETE" })
  markMenuDataChanged()
}

export async function swapDiningSceneSortOrders(sourceId: string, targetId: string): Promise<void> {
  await request<void>({ path: "/api/dining-scenes/order/swap", method: "PUT", data: { source_id: sourceId, target_id: targetId } })
  markMenuDataChanged()
}

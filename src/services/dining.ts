import type {
  DiningMode,
  DiningPlace,
  DiningScene
} from "../types/dining"
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

export async function listDiningPlaces(sceneId?: string): Promise<DiningPlace[]> {
  const data = await request<{ items: DiningPlace[] }>({
    path: sceneId ? `/api/dining?scene_id=${encodeURIComponent(sceneId)}` : "/api/dining"
  })
  return data.items
}

export async function getDiningPlace(id: string): Promise<DiningPlace> {
  const data = await request<{ item: DiningPlace }>({ path: `/api/dining/${id}` })
  return data.item
}

export async function createDiningPlace(input: {
  name: string
  scene_id: string
  service_modes: DiningMode[]
  menu_items: string[]
}): Promise<DiningPlace> {
  const data = await request<{ item: DiningPlace }>({
    path: "/api/dining",
    method: "POST",
    data: input
  })
  return data.item
}

export async function updateDiningPlace(
  id: string,
  input: { name: string; scene_id: string; service_modes: DiningMode[]; menu_items: string[] }
): Promise<DiningPlace> {
  const data = await request<{ item: DiningPlace }>({
    path: `/api/dining/${id}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export function deleteDiningPlace(id: string): Promise<void> {
  return request<void>({ path: `/api/dining/${id}`, method: "DELETE" })
}

import type {
  LuggageGroup,
  LuggageItem,
  LuggageScene
} from "../types/luggage"
import { request } from "./request"

export async function listLuggageScenes(): Promise<LuggageScene[]> {
  const data = await request<{ items: LuggageScene[] }>({ path: "/api/luggage" })
  return data.items
}

export async function createLuggageScene(name: string): Promise<LuggageScene> {
  const data = await request<{ item: LuggageScene }>({
    path: "/api/luggage/scenes",
    method: "POST",
    data: { name }
  })
  return data.item
}

export function updateLuggageScene(id: string, name: string): Promise<void> {
  return request<void>({ path: `/api/luggage/scenes/${id}`, method: "PUT", data: { name } })
}

export function deleteLuggageScene(id: string): Promise<void> {
  return request<void>({ path: `/api/luggage/scenes/${id}`, method: "DELETE" })
}

export async function createLuggageGroup(sceneId: string, name: string): Promise<LuggageGroup> {
  const data = await request<{ item: LuggageGroup }>({
    path: "/api/luggage/groups",
    method: "POST",
    data: { scene_id: sceneId, name }
  })
  return data.item
}

export function updateLuggageGroup(id: string, name: string): Promise<void> {
  return request<void>({ path: `/api/luggage/groups/${id}`, method: "PUT", data: { name } })
}

export function deleteLuggageGroup(id: string): Promise<void> {
  return request<void>({ path: `/api/luggage/groups/${id}`, method: "DELETE" })
}

export function moveLuggageGroup(
  sourceId: string,
  targetId: string,
  insertAfter: boolean
): Promise<void> {
  return request<void>({
    path: "/api/luggage/groups/order/move",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId, insert_after: insertAfter }
  })
}

export async function createLuggageItem(groupId: string, name: string): Promise<LuggageItem> {
  const data = await request<{ item: LuggageItem }>({
    path: "/api/luggage/items",
    method: "POST",
    data: { group_id: groupId, name }
  })
  return data.item
}

export function updateLuggageItem(id: string, name: string): Promise<void> {
  return request<void>({ path: `/api/luggage/items/${id}`, method: "PUT", data: { name } })
}

export function moveLuggageItem(
  id: string,
  targetGroupId: string,
  targetItemId?: string,
  insertAfter = false
): Promise<void> {
  return request<void>({
    path: `/api/luggage/items/${id}/move`,
    method: "PUT",
    data: { target_group_id: targetGroupId, target_item_id: targetItemId || null, insert_after: insertAfter }
  })
}

export function deleteLuggageItem(id: string): Promise<void> {
  return request<void>({ path: `/api/luggage/items/${id}`, method: "DELETE" })
}

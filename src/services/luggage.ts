import type {
  LuggageGroup,
  LuggageItem,
  LuggageScene
} from "../types/luggage"
import {
  cacheLuggageScenes,
  getCachedLuggageScenes,
  getLuggageDataRevision,
  replaceLuggageDataCache,
  updateLuggageDataCache
} from "../utils/luggage-data-cache"
import { request } from "./request"

type LuggageSceneRecord = Omit<LuggageScene, "groups">
type LuggageGroupRecord = Omit<LuggageGroup, "items">
type PendingLuggageScenesRequest = {
  forceRefresh: boolean
  revision: number
  promise: Promise<LuggageScene[]>
}

let pendingLuggageScenesRequest: PendingLuggageScenesRequest | null = null

function sortByOrder<T extends { sort_order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.sort_order - right.sort_order)
}

function patchCachedScenes(updater: (scenes: LuggageScene[]) => LuggageScene[]): void {
  updateLuggageDataCache(updater)
}

export async function listLuggageScenes(forceRefresh = false): Promise<LuggageScene[]> {
  const cachedScenes = forceRefresh ? null : getCachedLuggageScenes()
  if (cachedScenes) return cachedScenes

  if (!pendingLuggageScenesRequest) {
    const revision = getLuggageDataRevision()
    pendingLuggageScenesRequest = {
      forceRefresh,
      revision,
      promise: request<{ items: LuggageScene[] }>({ path: "/api/luggage" })
        .then((data) => data.items)
    }
  }

  const currentRequest = pendingLuggageScenesRequest
  try {
    const scenes = await currentRequest.promise
    if (currentRequest.revision === getLuggageDataRevision()) {
      if (currentRequest.forceRefresh) replaceLuggageDataCache(scenes)
      else cacheLuggageScenes(scenes)
      return getCachedLuggageScenes() || []
    }
    return getCachedLuggageScenes() || scenes
  } finally {
    if (pendingLuggageScenesRequest === currentRequest) pendingLuggageScenesRequest = null
  }
}

export async function createLuggageScene(name: string): Promise<LuggageScene> {
  const data = await request<{ item: LuggageScene }>({
    path: "/api/luggage/scenes",
    method: "POST",
    data: { name }
  })
  patchCachedScenes((scenes) => sortByOrder([...scenes, data.item]))
  return data.item
}

export async function updateLuggageScene(id: string, name: string): Promise<void> {
  const data = await request<{ item: LuggageSceneRecord }>({
    path: `/api/luggage/scenes/${id}`,
    method: "PUT",
    data: { name }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => (
    scene.id === id ? { ...scene, ...data.item, groups: scene.groups } : scene
  )))
}

export async function deleteLuggageScene(id: string): Promise<void> {
  await request<void>({ path: `/api/luggage/scenes/${id}`, method: "DELETE" })
  patchCachedScenes((scenes) => scenes.filter((scene) => scene.id !== id))
}

export async function reorderLuggageScenes(sceneIds: string[]): Promise<void> {
  await request<{ updated: number }>({
    path: "/api/luggage/scenes/order",
    method: "PUT",
    data: { scene_ids: sceneIds }
  })
  patchCachedScenes((scenes) => {
    const scenesById = new Map(scenes.map((scene) => [scene.id, scene]))
    const reordered = sceneIds.map((id, index) => {
      const scene = scenesById.get(id)
      return scene ? { ...scene, sort_order: (index + 1) * 1000 } : null
    }).filter((scene): scene is LuggageScene => Boolean(scene))
    return reordered.length === scenes.length ? reordered : scenes
  })
}

export async function createLuggageGroup(sceneId: string, name: string): Promise<LuggageGroup> {
  const data = await request<{ item: LuggageGroup }>({
    path: "/api/luggage/groups",
    method: "POST",
    data: { scene_id: sceneId, name }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => (
    scene.id === sceneId
      ? { ...scene, groups: sortByOrder([...scene.groups, data.item]) }
      : scene
  )))
  return data.item
}

export async function updateLuggageGroup(id: string, name: string): Promise<void> {
  const data = await request<{ item: LuggageGroupRecord }>({
    path: `/api/luggage/groups/${id}`,
    method: "PUT",
    data: { name }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => ({
    ...scene,
    groups: scene.groups.map((group) => (
      group.id === id ? { ...group, ...data.item, items: group.items } : group
    ))
  })))
}

export async function deleteLuggageGroup(id: string): Promise<void> {
  await request<void>({ path: `/api/luggage/groups/${id}`, method: "DELETE" })
  patchCachedScenes((scenes) => scenes.map((scene) => ({
    ...scene,
    groups: scene.groups.filter((group) => group.id !== id)
  })))
}

export async function createLuggageItem(groupId: string, name: string): Promise<LuggageItem> {
  const data = await request<{ item: LuggageItem }>({
    path: "/api/luggage/items",
    method: "POST",
    data: { group_id: groupId, name }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => ({
    ...scene,
    groups: scene.groups.map((group) => (
      group.id === groupId
        ? { ...group, items: sortByOrder([...group.items, data.item]) }
        : group
    ))
  })))
  return data.item
}

export async function updateLuggageItem(id: string, name: string): Promise<void> {
  const data = await request<{ item: LuggageItem }>({
    path: `/api/luggage/items/${id}`,
    method: "PUT",
    data: { name }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => ({
    ...scene,
    groups: scene.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => item.id === id ? data.item : item)
    }))
  })))
}

export async function deleteLuggageItem(id: string): Promise<void> {
  await request<void>({ path: `/api/luggage/items/${id}`, method: "DELETE" })
  patchCachedScenes((scenes) => scenes.map((scene) => ({
    ...scene,
    groups: scene.groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => item.id !== id)
    }))
  })))
}

export async function reorderLuggageScene(
  sceneId: string,
  groupIds: string[],
  itemIdsByGroup: Record<string, string[]>
): Promise<void> {
  await request<{ updated: number }>({
    path: "/api/luggage/order",
    method: "PUT",
    data: {
      scene_id: sceneId,
      group_ids: groupIds,
      item_ids_by_group: itemIdsByGroup
    }
  })
  patchCachedScenes((scenes) => scenes.map((scene) => {
    if (scene.id !== sceneId) return scene
    const groupsById = new Map(scene.groups.map((group) => [group.id, group]))
    const groups = groupIds.map((groupId, groupIndex) => {
      const group = groupsById.get(groupId)
      if (!group) return null
      const itemsById = new Map(group.items.map((item) => [item.id, item]))
      const items = (itemIdsByGroup[groupId] || []).map((itemId, itemIndex) => {
        const item = itemsById.get(itemId)
        return item ? { ...item, group_id: groupId, sort_order: (itemIndex + 1) * 1000 } : null
      }).filter((item): item is LuggageItem => Boolean(item))
      return { ...group, sort_order: (groupIndex + 1) * 1000, items }
    }).filter((group): group is LuggageGroup => Boolean(group))
    return groups.length === scene.groups.length ? { ...scene, groups } : scene
  }))
}

import type {
  ActivityItem,
  ActivityType,
  DiningMode,
  DiningPlace,
  LuggageGroup,
  LuggageItem,
  LuggageScene,
  MediaEntry,
  MediaEntryPage,
  MediaEpisode,
  MediaSeason,
  FavoriteMediaEpisode,
  MediaCategory,
  MediaStatus,
  MediaTimelineNote,
  MediaType
} from "../types/life-lists"
import { request } from "./request"

function queryString(values: Record<string, string | undefined>): string {
  const parts = Object.keys(values)
    .filter((key) => values[key] !== undefined && values[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key] as string)}`)
  return parts.length > 0 ? `?${parts.join("&")}` : ""
}

export async function listMediaEntries(input: {
  mediaType: MediaType
  status?: MediaStatus
  revisitable?: boolean
  keyword?: string
  page?: number
  pageSize?: number
}): Promise<MediaEntryPage> {
  return request<MediaEntryPage>({
    path: `/api/media${queryString({
      media_type: input.mediaType,
      watch_status: input.status,
      is_revisitable: input.revisitable ? "true" : undefined,
      keyword: input.keyword,
      page: input.page ? String(input.page) : undefined,
      page_size: input.pageSize ? String(input.pageSize) : undefined
    })}`
  })
}

export async function getMediaEntry(id: string): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({ path: `/api/media/${id}` })
  return data.item
}

export async function listMediaCategories(): Promise<MediaCategory[]> {
  const data = await request<{ items: MediaCategory[] }>({ path: "/api/media-categories" })
  return data.items
}

export async function getMediaCategory(id: string): Promise<MediaCategory> {
  const data = await request<{ item: MediaCategory }>({ path: `/api/media-categories/${id}` })
  return data.item
}

export async function createMediaCategory(name: string): Promise<MediaCategory> {
  const data = await request<{ item: MediaCategory }>({
    path: "/api/media-categories",
    method: "POST",
    data: { name }
  })
  return data.item
}

export async function updateMediaCategory(id: string, name: string): Promise<MediaCategory> {
  const data = await request<{ item: MediaCategory }>({
    path: `/api/media-categories/${id}`,
    method: "PUT",
    data: { name }
  })
  return data.item
}

export function deleteMediaCategory(id: string): Promise<void> {
  return request<void>({ path: `/api/media-categories/${id}`, method: "DELETE" })
}

export function swapMediaCategorySortOrders(sourceId: string, targetId: string): Promise<void> {
  return request<void>({
    path: "/api/media-categories/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

export async function createMediaEntry(input: {
  title: string
  media_type: MediaType
  watch_status: MediaStatus
  platforms: string[]
  is_revisitable?: boolean
}): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({
    path: "/api/media",
    method: "POST",
    data: input
  })
  return data.item
}

export async function updateMediaEntry(
  id: string,
  input: {
    title?: string
    media_type?: MediaType
    watch_status?: MediaStatus
    platforms?: string[]
    is_revisitable?: boolean
  }
): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({
    path: `/api/media/${id}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export function deleteMediaEntry(id: string): Promise<void> {
  return request<void>({ path: `/api/media/${id}`, method: "DELETE" })
}

export async function setMediaEntryCoverFromSeason(
  mediaEntryId: string,
  seasonId: string
): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({
    path: `/api/media/${mediaEntryId}/cover`,
    method: "PUT",
    data: { season_id: seasonId }
  })
  return data.item
}

export function swapMediaEntrySortOrders(
  sourceId: string,
  targetId: string
): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/media/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

export function reorderMediaEntrySortOrders(mediaType: MediaType, ids: string[]): Promise<{ updated: number }> {
  return request<{ updated: number }>({
    path: "/api/media/reorder",
    method: "PUT",
    data: { media_type: mediaType, ids }
  })
}

export async function listMediaSeasons(mediaEntryId: string): Promise<MediaSeason[]> {
  const data = await request<{ items: MediaSeason[] }>({
    path: `/api/media/${mediaEntryId}/seasons`
  })
  return data.items
}

export async function createMediaSeason(
  mediaEntryId: string,
  name: string,
  episodeCount: number
): Promise<MediaSeason> {
  const data = await request<{ item: MediaSeason }>({
    path: `/api/media/${mediaEntryId}/seasons`,
    method: "POST",
    data: { name, episode_count: episodeCount }
  })
  return data.item
}

export async function updateMediaSeason(id: string, name: string): Promise<MediaSeason> {
  const data = await request<{ item: MediaSeason }>({
    path: `/api/media-seasons/${id}`,
    method: "PUT",
    data: { name }
  })
  return data.item
}

export function deleteMediaSeason(id: string): Promise<void> {
  return request<void>({ path: `/api/media-seasons/${id}`, method: "DELETE" })
}

export async function addNextMediaEpisode(seasonId: string): Promise<MediaEpisode> {
  const data = await request<{ item: MediaEpisode }>({
    path: `/api/media-seasons/${seasonId}/episodes`,
    method: "POST"
  })
  return data.item
}

export async function getMediaEpisode(id: string): Promise<MediaEpisode> {
  const data = await request<{ item: MediaEpisode }>({ path: `/api/media-episodes/${id}` })
  return data.item
}

export async function updateMediaEpisode(
  id: string,
  input: {
    title?: string
    plot_summary?: string
    timeline_notes?: MediaTimelineNote[]
    is_favorite?: boolean
  }
): Promise<MediaEpisode> {
  const data = await request<{ item: MediaEpisode }>({
    path: `/api/media-episodes/${id}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export async function listFavoriteMediaEpisodes(input: {
  mediaType: MediaType
  keyword?: string
}): Promise<FavoriteMediaEpisode[]> {
  const data = await request<{ items: FavoriteMediaEpisode[] }>({
    path: `/api/media-episodes/favorites${queryString({
      media_type: input.mediaType,
      keyword: input.keyword
    })}`
  })
  return data.items
}

export async function listActivityItems(activityType: ActivityType): Promise<ActivityItem[]> {
  const data = await request<{ items: ActivityItem[] }>({
    path: `/api/activities${queryString({ activity_type: activityType })}`
  })
  return data.items
}

export async function createActivityItem(
  name: string,
  activityType: ActivityType
): Promise<ActivityItem> {
  const data = await request<{ item: ActivityItem }>({
    path: "/api/activities",
    method: "POST",
    data: { name, activity_type: activityType }
  })
  return data.item
}

export async function updateActivityItem(
  id: string,
  name: string,
  activityType: ActivityType
): Promise<ActivityItem> {
  const data = await request<{ item: ActivityItem }>({
    path: `/api/activities/${id}`,
    method: "PUT",
    data: { name, activity_type: activityType }
  })
  return data.item
}

export function deleteActivityItem(id: string): Promise<void> {
  return request<void>({ path: `/api/activities/${id}`, method: "DELETE" })
}

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

export function swapLuggageGroupSortOrders(sourceId: string, targetId: string): Promise<void> {
  return request<void>({
    path: "/api/luggage/groups/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
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

export async function listDiningPlaces(): Promise<DiningPlace[]> {
  const data = await request<{ items: DiningPlace[] }>({
    path: "/api/dining"
  })
  return data.items
}

export async function getDiningPlace(id: string): Promise<DiningPlace> {
  const data = await request<{ item: DiningPlace }>({ path: `/api/dining/${id}` })
  return data.item
}

export async function createDiningPlace(input: {
  name: string
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
  input: { name: string; service_modes: DiningMode[]; menu_items: string[] }
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

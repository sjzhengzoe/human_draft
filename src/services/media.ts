import type {
  MediaCategory,
  MediaEntry,
  MediaEntryPage,
  MediaEpisode,
  MediaSeason,
  MediaStatus,
  MediaTimelineNote,
  MediaType
} from "../types/media"
import { queryString } from "./query-string"
import { request } from "./request"

export async function listMediaEntries(input: {
  mediaType?: MediaType
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

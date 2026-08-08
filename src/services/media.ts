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
import {
  addCachedMediaCategory,
  adjustCachedMediaEntryStats,
  cacheAddedMediaEpisode,
  cacheMediaCategories,
  cacheMediaEntry,
  cacheMediaEntryPage,
  cacheMediaSeasons,
  getCachedMediaCategories,
  getCachedMediaEntry,
  getCachedMediaEntryPage,
  getCachedMediaEpisode,
  getCachedMediaSeasons,
  invalidateCachedMediaSeasons,
  isMediaCategoriesCacheFresh,
  isMediaEntryCacheFresh,
  isMediaSeasonsCacheFresh,
  removeCachedMediaCategory,
  removeCachedMediaEntry,
  removeCachedMediaSeason,
  reorderCachedMediaEntries,
  swapCachedMediaCategorySortOrders,
  updateCachedMediaCategory,
  updateCachedMediaEpisode,
  updateCachedMediaSeason
} from "../utils/media-data-cache"
import { queryString } from "./query-string"
import { request, upload } from "./request"

type CacheReadOptions = {
  forceRefresh?: boolean
}

export async function listMediaEntries(input: {
  mediaType?: MediaType
  status?: MediaStatus
  personalRating?: number
  revisitable?: boolean
  keyword?: string
  sort?: "created_desc" | "rating_desc"
  page?: number
  pageSize?: number
}, options: CacheReadOptions = {}): Promise<MediaEntryPage> {
  const cached = options.forceRefresh ? null : getCachedMediaEntryPage(input)
  if (cached?.fresh) return cached.data
  const data = await request<MediaEntryPage>({
    path: `/api/media${queryString({
      media_type: input.mediaType,
      watch_status: input.status,
      personal_rating: input.personalRating ? String(input.personalRating) : undefined,
      is_revisitable: input.revisitable ? "true" : undefined,
      keyword: input.keyword,
      sort: input.sort,
      page: input.page ? String(input.page) : undefined,
      page_size: input.pageSize ? String(input.pageSize) : undefined
    })}`
  })
  cacheMediaEntryPage(input, data)
  return data
}

export async function getMediaEntry(id: string, options: CacheReadOptions = {}): Promise<MediaEntry> {
  const cached = options.forceRefresh || !isMediaEntryCacheFresh(id) ? null : getCachedMediaEntry(id)
  if (cached) return cached
  const data = await request<{ item: MediaEntry }>({ path: `/api/media/${id}` })
  cacheMediaEntry(data.item)
  return data.item
}

export async function listMediaCategories(options: CacheReadOptions = {}): Promise<MediaCategory[]> {
  const cached = options.forceRefresh || !isMediaCategoriesCacheFresh()
    ? null
    : getCachedMediaCategories()
  if (cached) return cached
  const data = await request<{ items: MediaCategory[] }>({ path: "/api/media-categories" })
  cacheMediaCategories(data.items)
  return data.items
}

export async function getMediaCategory(id: string, options: CacheReadOptions = {}): Promise<MediaCategory> {
  const cached = options.forceRefresh
    ? null
    : getCachedMediaCategories()?.find((category) => category.id === id)
  if (cached) return cached
  const data = await request<{ item: MediaCategory }>({ path: `/api/media-categories/${id}` })
  updateCachedMediaCategory(data.item)
  return data.item
}

export async function createMediaCategory(name: string): Promise<MediaCategory> {
  const data = await request<{ item: MediaCategory }>({
    path: "/api/media-categories",
    method: "POST",
    data: { name }
  })
  addCachedMediaCategory(data.item)
  return data.item
}

export async function updateMediaCategory(id: string, name: string): Promise<MediaCategory> {
  const data = await request<{ item: MediaCategory }>({
    path: `/api/media-categories/${id}`,
    method: "PUT",
    data: { name }
  })
  updateCachedMediaCategory(data.item)
  return data.item
}

export async function deleteMediaCategory(id: string): Promise<void> {
  await request<void>({ path: `/api/media-categories/${id}`, method: "DELETE" })
  removeCachedMediaCategory(id)
}

export async function swapMediaCategorySortOrders(sourceId: string, targetId: string): Promise<void> {
  await request<void>({
    path: "/api/media-categories/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
  swapCachedMediaCategorySortOrders(sourceId, targetId)
}

export async function createMediaEntry(input: {
  title: string
  media_type: MediaType
  watch_status: MediaStatus
  platforms: string[]
  personal_rating?: number | null
  is_revisitable?: boolean
}): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({
    path: "/api/media",
    method: "POST",
    data: input
  })
  cacheMediaEntry(data.item)
  return data.item
}

export async function updateMediaEntry(
  id: string,
  input: {
    title?: string
    media_type?: MediaType
    watch_status?: MediaStatus
    platforms?: string[]
    personal_rating?: number | null
    is_revisitable?: boolean
  }
): Promise<MediaEntry> {
  const data = await request<{ item: MediaEntry }>({
    path: `/api/media/${id}`,
    method: "PUT",
    data: input
  })
  cacheMediaEntry(data.item)
  return data.item
}

export async function replaceMediaEntryCover(
  id: string,
  imagePath: string
): Promise<MediaEntry> {
  const data = await upload<{ item: MediaEntry }>({
    path: `/api/media/${id}/image`,
    filePath: imagePath
  })
  cacheMediaEntry(data.item)
  return data.item
}

export async function deleteMediaEntry(id: string): Promise<void> {
  await request<void>({ path: `/api/media/${id}`, method: "DELETE" })
  removeCachedMediaEntry(id)
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
  cacheMediaEntry(data.item)
  return data.item
}

export async function reorderMediaEntrySortOrders(mediaType: MediaType, ids: string[]): Promise<{ updated: number }> {
  const data = await request<{ updated: number }>({
    path: "/api/media/reorder",
    method: "PUT",
    data: { media_type: mediaType, ids }
  })
  reorderCachedMediaEntries(mediaType, ids)
  return data
}

export async function listMediaSeasons(
  mediaEntryId: string,
  options: CacheReadOptions = {}
): Promise<MediaSeason[]> {
  const cached = options.forceRefresh || !isMediaSeasonsCacheFresh(mediaEntryId)
    ? null
    : getCachedMediaSeasons(mediaEntryId)
  if (cached) return cached
  const data = await request<{ items: MediaSeason[] }>({
    path: `/api/media/${mediaEntryId}/seasons`
  })
  cacheMediaSeasons(mediaEntryId, data.items)
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
  adjustCachedMediaEntryStats(mediaEntryId, {
    seasonDelta: 1,
    episodeDelta: episodeCount
  })
  invalidateCachedMediaSeasons(mediaEntryId)
  return data.item
}

export async function updateMediaSeason(id: string, name: string): Promise<MediaSeason> {
  const data = await request<{ item: MediaSeason }>({
    path: `/api/media-seasons/${id}`,
    method: "PUT",
    data: { name }
  })
  updateCachedMediaSeason(data.item)
  return data.item
}

export async function deleteMediaSeason(id: string): Promise<void> {
  await request<void>({ path: `/api/media-seasons/${id}`, method: "DELETE" })
  removeCachedMediaSeason(id)
}

export async function addNextMediaEpisode(seasonId: string): Promise<MediaEpisode> {
  const data = await request<{ item: MediaEpisode }>({
    path: `/api/media-seasons/${seasonId}/episodes`,
    method: "POST"
  })
  cacheAddedMediaEpisode(data.item)
  return data.item
}

export async function getMediaEpisode(id: string, options: CacheReadOptions = {}): Promise<MediaEpisode> {
  const cached = options.forceRefresh ? null : getCachedMediaEpisode(id)
  if (cached) return cached
  const data = await request<{ item: MediaEpisode }>({ path: `/api/media-episodes/${id}` })
  updateCachedMediaEpisode(data.item)
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
  updateCachedMediaEpisode(data.item)
  return data.item
}

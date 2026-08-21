import type {
  MediaCategory,
  MediaEntry,
  MediaEntryPage,
  MediaEpisode,
  MediaSeason,
  MediaStatus,
  MediaTimelineDialogue,
  MediaTimelineNote
} from "../types/media"

export const MEDIA_CACHE_FRESH_MS = 3 * 60 * 1000
const MAX_CACHED_MEDIA_DETAILS = 20

export type MediaEntryQuery = {
  mediaType?: string
  status?: MediaStatus
  personalRating?: number
  specialFavorite?: boolean
  keyword?: string
  sort?: "created_desc" | "rating_desc"
  page?: number
  pageSize?: number
}

type CachedEntryPage = {
  input: MediaEntryQuery
  data: MediaEntryPage
  cachedAt: number
}

let cachedCategories: MediaCategory[] | null = null
let cachedCategoriesAt = 0
const cachedEntries = new Map<string, MediaEntry>()
const cachedEntriesAt = new Map<string, number>()
const cachedSeasons = new Map<string, MediaSeason[]>()
const cachedSeasonsAt = new Map<string, number>()
const cachedSeasonsAccessedAt = new Map<string, number>()
const cachedEpisodes = new Map<string, MediaEpisode>()
const cachedEntryPages = new Map<string, CachedEntryPage>()
const deletedEntryIds = new Set<string>()

function entryPageKey(input: MediaEntryQuery) {
  return JSON.stringify({
    mediaType: input.mediaType || "",
    status: input.status || "",
    personalRating: input.personalRating || 0,
    specialFavorite: input.specialFavorite || false,
    keyword: String(input.keyword || "").trim().toLocaleLowerCase(),
    sort: input.sort || "",
    page: input.page || 1,
    pageSize: input.pageSize || 20
  })
}

function entryMatchesQuery(entry: MediaEntry, input: MediaEntryQuery) {
  const keyword = String(input.keyword || "").trim().toLocaleLowerCase()
  return (!input.mediaType || entry.media_type === input.mediaType) &&
    (!input.status || entry.watch_status === input.status) &&
    (!input.specialFavorite || input.specialFavorite === entry.is_special_favorite) &&
    (!input.personalRating || (
      entry.watch_status === "completed"
      && entry.personal_rating === input.personalRating
    )) &&
    (!keyword || entry.title.toLocaleLowerCase().includes(keyword))
}

function cloneCategory(category: MediaCategory): MediaCategory {
  return { ...category }
}

function cloneEntry(entry: MediaEntry): MediaEntry {
  return { ...entry, platforms: [...entry.platforms] }
}

function cloneDialogue(dialogue: MediaTimelineDialogue): MediaTimelineDialogue {
  return { ...dialogue }
}

function cloneTimelineNote(note: MediaTimelineNote): MediaTimelineNote {
  return {
    ...note,
    dialogues: Array.isArray(note.dialogues)
      ? note.dialogues.map(cloneDialogue)
      : note.dialogues
  }
}

function cloneEpisode(episode: MediaEpisode): MediaEpisode {
  return {
    ...episode,
    timeline_notes: Array.isArray(episode.timeline_notes)
      ? episode.timeline_notes.map(cloneTimelineNote)
      : []
  }
}

function cloneSeason(season: MediaSeason): MediaSeason {
  return {
    ...season,
    episodes: Array.isArray(season.episodes)
      ? season.episodes.map(cloneEpisode)
      : []
  }
}

function cloneEntryPage(page: MediaEntryPage): MediaEntryPage {
  return {
    items: page.items.map(cloneEntry),
    pagination: { ...page.pagination }
  }
}

function storeEntryValue(entry: MediaEntry) {
  const previous = cachedEntries.get(entry.id)
  const nextEntry = cloneEntry({ ...previous, ...entry })
  cachedEntries.set(entry.id, nextEntry)
  cachedEntriesAt.set(entry.id, Date.now())
  deletedEntryIds.delete(entry.id)
  return { previous, nextEntry }
}

function cacheEntryValue(entry: MediaEntry) {
  const { previous, nextEntry } = storeEntryValue(entry)
  for (const [key, page] of cachedEntryPages) {
    const existingIndex = page.data.items.findIndex((item) => item.id === nextEntry.id)
    const matchedBefore = previous
      ? entryMatchesQuery(previous, page.input)
      : existingIndex >= 0
    const matches = entryMatchesQuery(nextEntry, page.input)
    const membershipChanged = Boolean(previous) && matches !== matchedBefore
    const ratingOrderChanged = page.input.sort === "rating_desc" && Boolean(previous) && (
      previous?.personal_rating !== nextEntry.personal_rating
      || previous?.updated_at !== nextEntry.updated_at
    )
    let nextItems = page.data.items.filter((item) => item.id !== nextEntry.id)
    if (matches && existingIndex >= 0) {
      nextItems.push(cloneEntry(nextEntry))
    } else if (membershipChanged && matches && (page.input.page || 1) === 1) {
      nextItems = [cloneEntry(nextEntry), ...nextItems]
    }
    cachedEntryPages.set(key, {
      ...page,
      cachedAt: (!previous && matches) || membershipChanged || ratingOrderChanged ? 0 : page.cachedAt,
      data: {
        items: nextItems,
        pagination: {
          ...page.data.pagination,
          total: Math.max(0, page.data.pagination.total + (membershipChanged ? (matches ? 1 : -1) : 0))
        }
      }
    })
  }
}

function updateCachedEntryStats(mediaEntryId: string, seasons: MediaSeason[]) {
  const entry = cachedEntries.get(mediaEntryId)
  if (!entry) return
  const episodes = seasons.flatMap((season) => season.episodes)
  const progressSeason = seasons.find((season) =>
    season.episodes.some((episode) => episode.id === entry.last_watched_episode_id)
  )
  const progressEpisode = progressSeason?.episodes.find((episode) =>
    episode.id === entry.last_watched_episode_id
  )
  cacheEntryValue({
    ...entry,
    season_count: seasons.length,
    episode_count: episodes.length,
    favorite_episode_count: episodes.filter((episode) => episode.is_favorite).length,
    last_watched_episode_id: progressEpisode?.id || "",
    last_watched_episode_number: progressEpisode?.episode_number ?? null,
    last_watched_season_id: progressSeason?.id || "",
    last_watched_season_name: progressSeason?.name || "",
    last_watched_season_sort_order: progressSeason?.sort_order ?? null
  })
}

export function getCachedMediaCategories(): MediaCategory[] | null {
  return cachedCategories?.map(cloneCategory) || null
}

export function isMediaCategoriesCacheFresh() {
  return Boolean(cachedCategories && Date.now() - cachedCategoriesAt < MEDIA_CACHE_FRESH_MS)
}

export function cacheMediaCategories(categories: MediaCategory[]) {
  cachedCategories = categories.map(cloneCategory)
  cachedCategoriesAt = Date.now()
}

export function addCachedMediaCategory(category: MediaCategory) {
  if (!cachedCategories) return
  cachedCategories = [...cachedCategories, cloneCategory(category)]
    .sort((left, right) => left.sort_order - right.sort_order)
  cachedCategoriesAt = Date.now()
}

export function updateCachedMediaCategory(category: MediaCategory) {
  if (!cachedCategories) return
  cachedCategories = cachedCategories.map((item) =>
    item.id === category.id ? cloneCategory(category) : item
  )
  cachedCategoriesAt = Date.now()
}

export function removeCachedMediaCategory(id: string) {
  if (!cachedCategories) return
  cachedCategories = cachedCategories.filter((category) => category.id !== id)
  cachedCategoriesAt = Date.now()
}

export function swapCachedMediaCategorySortOrders(sourceId: string, targetId: string) {
  if (!cachedCategories) return
  const source = cachedCategories.find((category) => category.id === sourceId)
  const target = cachedCategories.find((category) => category.id === targetId)
  if (!source || !target) return
  const sourceOrder = source.sort_order
  const targetOrder = target.sort_order
  cachedCategories = cachedCategories
    .map((category) => {
      if (category.id === sourceId) return { ...category, sort_order: targetOrder }
      if (category.id === targetId) return { ...category, sort_order: sourceOrder }
      return category
    })
    .sort((left, right) => left.sort_order - right.sort_order)
  cachedCategoriesAt = Date.now()
}

export function getCachedMediaEntry(id: string): MediaEntry | null {
  const entry = cachedEntries.get(id)
  return entry ? cloneEntry(entry) : null
}

export function isMediaEntryCacheFresh(id: string) {
  return Boolean(cachedEntries.has(id) && Date.now() - (cachedEntriesAt.get(id) || 0) < MEDIA_CACHE_FRESH_MS)
}

export function getCachedMediaEntryPage(input: MediaEntryQuery): {
  data: MediaEntryPage
  fresh: boolean
} | null {
  const cached = cachedEntryPages.get(entryPageKey(input))
  if (!cached) return null
  return {
    data: cloneEntryPage(cached.data),
    fresh: Date.now() - cached.cachedAt < MEDIA_CACHE_FRESH_MS
  }
}

export function cacheMediaEntryPage(input: MediaEntryQuery, data: MediaEntryPage) {
  data.items.forEach(storeEntryValue)
  cachedEntryPages.set(entryPageKey(input), {
    input: { ...input },
    data: cloneEntryPage(data),
    cachedAt: Date.now()
  })
}

export function getCachedMediaEntries(): MediaEntry[] {
  return [...cachedEntries.values()].map(cloneEntry)
}

export function getDeletedMediaEntryIds(): string[] {
  return [...deletedEntryIds]
}

export function cacheMediaEntry(entry: MediaEntry) {
  cacheEntryValue(entry)
}

export function removeCachedMediaEntry(id: string) {
  const previous = cachedEntries.get(id)
  cachedEntries.delete(id)
  cachedEntriesAt.delete(id)
  const seasons = cachedSeasons.get(id) || []
  seasons.forEach((season) => season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id)))
  cachedSeasons.delete(id)
  cachedSeasonsAt.delete(id)
  cachedSeasonsAccessedAt.delete(id)
  for (const [key, page] of cachedEntryPages) {
    const hadEntry = page.data.items.some((entry) => entry.id === id)
    const matchedBefore = previous
      ? entryMatchesQuery(previous, page.input)
      : hadEntry
    if (!matchedBefore && !hadEntry) continue
    cachedEntryPages.set(key, {
      ...page,
      cachedAt: 0,
      data: {
        items: page.data.items.filter((entry) => entry.id !== id),
        pagination: {
          ...page.data.pagination,
          total: Math.max(0, page.data.pagination.total - (matchedBefore ? 1 : 0))
        }
      }
    })
  }
  deletedEntryIds.add(id)
}

export function reorderCachedMediaEntries(mediaType: string, ids: string[]) {
  ids.forEach((id, index) => {
    const entry = cachedEntries.get(id)
    if (!entry || entry.media_type !== mediaType) return
    cacheEntryValue({ ...entry, sort_order: (index + 1) * 1000 })
  })
}

export function adjustCachedMediaEntryStats(
  mediaEntryId: string,
  input: { seasonDelta?: number; episodeDelta?: number }
) {
  const entry = cachedEntries.get(mediaEntryId)
  if (!entry) return
  cacheEntryValue({
    ...entry,
    season_count: Math.max(0, entry.season_count + (input.seasonDelta || 0)),
    episode_count: Math.max(0, entry.episode_count + (input.episodeDelta || 0))
  })
}

export function getCachedMediaSeasons(mediaEntryId: string): MediaSeason[] | null {
  const seasons = cachedSeasons.get(mediaEntryId)
  if (seasons) cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
  return seasons?.map(cloneSeason) || null
}

export function isMediaSeasonsCacheFresh(mediaEntryId: string) {
  return Boolean(cachedSeasons.has(mediaEntryId) && Date.now() - (cachedSeasonsAt.get(mediaEntryId) || 0) < MEDIA_CACHE_FRESH_MS)
}

export function cacheMediaSeasons(mediaEntryId: string, seasons: MediaSeason[]) {
  const previousSeasons = cachedSeasons.get(mediaEntryId) || []
  previousSeasons.forEach((season) => {
    season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id))
  })
  const normalized = seasons.map(cloneSeason)
  cachedSeasons.set(mediaEntryId, normalized)
  cachedSeasonsAt.set(mediaEntryId, Date.now())
  cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
  normalized.forEach((season) => {
    season.episodes.forEach((episode) => cachedEpisodes.set(episode.id, cloneEpisode(episode)))
  })
  updateCachedEntryStats(mediaEntryId, normalized)
  while (cachedSeasons.size > MAX_CACHED_MEDIA_DETAILS) {
    const oldest = [...cachedSeasonsAccessedAt.entries()]
      .sort((left, right) => left[1] - right[1])[0]?.[0]
    if (!oldest) break
    invalidateCachedMediaSeasons(oldest)
  }
}

export function invalidateCachedMediaSeasons(mediaEntryId: string) {
  const seasons = cachedSeasons.get(mediaEntryId) || []
  seasons.forEach((season) => season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id)))
  cachedSeasons.delete(mediaEntryId)
  cachedSeasonsAt.delete(mediaEntryId)
  cachedSeasonsAccessedAt.delete(mediaEntryId)
}

export function updateCachedMediaSeason(updatedSeason: MediaSeason) {
  for (const [mediaEntryId, seasons] of cachedSeasons) {
    const index = seasons.findIndex((season) => season.id === updatedSeason.id)
    if (index < 0) continue
    const existing = seasons[index]
    const nextSeasons = [...seasons]
    nextSeasons[index] = cloneSeason({
      ...existing,
      ...updatedSeason,
      episodes: Array.isArray(updatedSeason.episodes)
        ? updatedSeason.episodes
        : existing.episodes
    })
    cachedSeasons.set(mediaEntryId, nextSeasons)
    cachedSeasonsAt.set(mediaEntryId, Date.now())
    cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
    return
  }
}

export function removeCachedMediaSeason(id: string) {
  for (const [mediaEntryId, seasons] of cachedSeasons) {
    const removedSeason = seasons.find((season) => season.id === id)
    if (!removedSeason) continue
    removedSeason.episodes.forEach((episode) => cachedEpisodes.delete(episode.id))
    const nextSeasons = seasons.filter((season) => season.id !== id)
    cachedSeasons.set(mediaEntryId, nextSeasons)
    cachedSeasonsAt.set(mediaEntryId, Date.now())
    cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
    updateCachedEntryStats(mediaEntryId, nextSeasons)
    return
  }
}

export function cacheAddedMediaEpisode(episode: MediaEpisode) {
  cachedEpisodes.set(episode.id, cloneEpisode(episode))
  for (const [mediaEntryId, seasons] of cachedSeasons) {
    const seasonIndex = seasons.findIndex((season) => season.id === episode.season_id)
    if (seasonIndex < 0) continue
    const nextSeasons = seasons.map((season, index) => index === seasonIndex
      ? {
          ...season,
          episodes: [...season.episodes, cloneEpisode(episode)]
            .sort((left, right) => left.episode_number - right.episode_number)
        }
      : season)
    cachedSeasons.set(mediaEntryId, nextSeasons)
    cachedSeasonsAt.set(mediaEntryId, Date.now())
    cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
    updateCachedEntryStats(mediaEntryId, nextSeasons)
    return
  }
}

export function getCachedMediaEpisode(id: string): MediaEpisode | null {
  const cachedEpisode = cachedEpisodes.get(id)
  if (cachedEpisode) return cloneEpisode(cachedEpisode)
  for (const seasons of cachedSeasons.values()) {
    for (const season of seasons) {
      const episode = season.episodes.find((item) => item.id === id)
      if (episode) return cloneEpisode(episode)
    }
  }
  return null
}

export function updateCachedMediaEpisode(updatedEpisode: MediaEpisode) {
  const previous = cachedEpisodes.get(updatedEpisode.id)
  cachedEpisodes.set(updatedEpisode.id, cloneEpisode({ ...previous, ...updatedEpisode }))
  for (const [mediaEntryId, seasons] of cachedSeasons) {
    let changed = false
    const nextSeasons = seasons.map((season) => ({
      ...season,
      episodes: season.episodes.map((episode) => {
        if (episode.id !== updatedEpisode.id) return episode
        changed = true
        return cloneEpisode({ ...episode, ...updatedEpisode })
      })
    }))
    if (!changed) continue
    cachedSeasons.set(mediaEntryId, nextSeasons)
    cachedSeasonsAt.set(mediaEntryId, Date.now())
    cachedSeasonsAccessedAt.set(mediaEntryId, Date.now())
    updateCachedEntryStats(mediaEntryId, nextSeasons)
    return
  }
}

export function clearMediaDataCache() {
  cachedCategories = null
  cachedCategoriesAt = 0
  cachedEntries.clear()
  cachedEntriesAt.clear()
  cachedSeasons.clear()
  cachedSeasonsAt.clear()
  cachedSeasonsAccessedAt.clear()
  cachedEpisodes.clear()
  cachedEntryPages.clear()
  deletedEntryIds.clear()
}

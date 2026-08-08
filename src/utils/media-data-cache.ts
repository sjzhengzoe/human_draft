import type {
  MediaCategory,
  MediaEntry,
  MediaEpisode,
  MediaSeason,
  MediaStatus,
  MediaTimelineDialogue,
  MediaTimelineNote
} from "../types/media"

let cachedCategories: MediaCategory[] | null = null
const cachedEntries = new Map<string, MediaEntry>()
const cachedSeasons = new Map<string, MediaSeason[]>()
const cachedEpisodes = new Map<string, MediaEpisode>()
const cachedEntryCollections = new Map<string, MediaEntry[]>()
const deletedEntryIds = new Set<string>()

function collectionKey(status?: string) {
  return status || "all"
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

function cacheEntryValue(entry: MediaEntry) {
  const previous = cachedEntries.get(entry.id)
  const nextEntry = cloneEntry({ ...previous, ...entry })
  cachedEntries.set(entry.id, nextEntry)
  for (const [key, entries] of cachedEntryCollections) {
    const includesEntry = key === "all" || nextEntry.watch_status === key
    const nextEntries = entries.filter((item) => item.id !== nextEntry.id)
    if (includesEntry) nextEntries.push(cloneEntry(nextEntry))
    cachedEntryCollections.set(key, nextEntries)
  }
  deletedEntryIds.delete(entry.id)
}

function updateCachedEntryStats(mediaEntryId: string, seasons: MediaSeason[]) {
  const entry = cachedEntries.get(mediaEntryId)
  if (!entry) return
  const episodes = seasons.flatMap((season) => season.episodes)
  cacheEntryValue({
    ...entry,
    season_count: seasons.length,
    episode_count: episodes.length,
    favorite_episode_count: episodes.filter((episode) => episode.is_favorite).length
  })
}

export function getCachedMediaCategories(): MediaCategory[] | null {
  return cachedCategories?.map(cloneCategory) || null
}

export function cacheMediaCategories(categories: MediaCategory[]) {
  cachedCategories = categories.map(cloneCategory)
}

export function addCachedMediaCategory(category: MediaCategory) {
  if (!cachedCategories) return
  cachedCategories = [...cachedCategories, cloneCategory(category)]
    .sort((left, right) => left.sort_order - right.sort_order)
}

export function updateCachedMediaCategory(category: MediaCategory) {
  if (!cachedCategories) return
  cachedCategories = cachedCategories.map((item) =>
    item.id === category.id ? cloneCategory(category) : item
  )
}

export function removeCachedMediaCategory(id: string) {
  if (!cachedCategories) return
  cachedCategories = cachedCategories.filter((category) => category.id !== id)
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
}

export function getCachedMediaEntry(id: string): MediaEntry | null {
  const entry = cachedEntries.get(id)
  return entry ? cloneEntry(entry) : null
}

export function getCachedMediaEntries(): MediaEntry[] {
  return [...cachedEntries.values()].map(cloneEntry)
}

export function getCachedMediaEntryCollection(status?: MediaStatus): MediaEntry[] | null {
  const entries = cachedEntryCollections.get(collectionKey(status))
  return entries?.map(cloneEntry) || null
}

export function cacheMediaEntryCollection(status: MediaStatus | undefined, entries: MediaEntry[]) {
  entries.forEach(cacheEntryValue)
  cachedEntryCollections.set(collectionKey(status), entries.map(cloneEntry))
}

export function getDeletedMediaEntryIds(): string[] {
  return [...deletedEntryIds]
}

export function cacheMediaEntry(entry: MediaEntry) {
  cacheEntryValue(entry)
}

export function cacheMediaEntries(entries: MediaEntry[]) {
  entries.forEach(cacheEntryValue)
}

export function removeCachedMediaEntry(id: string) {
  cachedEntries.delete(id)
  const seasons = cachedSeasons.get(id) || []
  seasons.forEach((season) => season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id)))
  cachedSeasons.delete(id)
  for (const [key, entries] of cachedEntryCollections) {
    cachedEntryCollections.set(key, entries.filter((entry) => entry.id !== id))
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
  return seasons?.map(cloneSeason) || null
}

export function cacheMediaSeasons(mediaEntryId: string, seasons: MediaSeason[]) {
  const previousSeasons = cachedSeasons.get(mediaEntryId) || []
  previousSeasons.forEach((season) => {
    season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id))
  })
  const normalized = seasons.map(cloneSeason)
  cachedSeasons.set(mediaEntryId, normalized)
  normalized.forEach((season) => {
    season.episodes.forEach((episode) => cachedEpisodes.set(episode.id, cloneEpisode(episode)))
  })
  updateCachedEntryStats(mediaEntryId, normalized)
}

export function invalidateCachedMediaSeasons(mediaEntryId: string) {
  const seasons = cachedSeasons.get(mediaEntryId) || []
  seasons.forEach((season) => season.episodes.forEach((episode) => cachedEpisodes.delete(episode.id)))
  cachedSeasons.delete(mediaEntryId)
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
    updateCachedEntryStats(mediaEntryId, nextSeasons)
    return
  }
}

export function clearMediaDataCache() {
  cachedCategories = null
  cachedEntries.clear()
  cachedSeasons.clear()
  cachedEpisodes.clear()
  cachedEntryCollections.clear()
  deletedEntryIds.clear()
}

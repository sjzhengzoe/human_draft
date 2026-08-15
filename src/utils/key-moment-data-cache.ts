import type { KeyMoment, KeyMomentGranularity } from "../types/key-moments"

export const KEY_MOMENT_CACHE_FRESH_MS = 5 * 60 * 60 * 1000
const MAX_CACHED_KEY_MOMENT_QUERIES = 24
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000

export type KeyMomentQuery = {
  granularity: KeyMomentGranularity
  date: string
}

type CachedKeyMomentQuery = {
  input: KeyMomentQuery
  items: KeyMoment[]
  cachedAt: number
}

const cachedQueries = new Map<string, CachedKeyMomentQuery>()
let keyMomentDataRevision = 0

function cloneKeyMoment(item: KeyMoment): KeyMoment {
  return {
    ...item,
    image_paths: [...item.image_paths],
    image_urls: [...item.image_urls]
  }
}

function cloneKeyMoments(items: KeyMoment[]): KeyMoment[] {
  return items.map(cloneKeyMoment)
}

function normalizedDateKey(granularity: KeyMomentGranularity, date: string): string {
  if (granularity === "year") return date.slice(0, 4)
  if (granularity === "month") return date.slice(0, 7)
  return date.slice(0, 10)
}

export function keyMomentQueryKey(input: KeyMomentQuery): string {
  return `${input.granularity}:${normalizedDateKey(input.granularity, input.date)}`
}

function itemDateKey(item: KeyMoment, granularity: KeyMomentGranularity): string {
  const value = new Date(new Date(item.occurred_at).getTime() + SHANGHAI_OFFSET_MS)
  const year = String(value.getUTCFullYear())
  const month = String(value.getUTCMonth() + 1).padStart(2, "0")
  const day = String(value.getUTCDate()).padStart(2, "0")
  if (granularity === "year") return year
  if (granularity === "month") return `${year}-${month}`
  return `${year}-${month}-${day}`
}

function itemMatchesQuery(item: KeyMoment, input: KeyMomentQuery): boolean {
  return itemDateKey(item, input.granularity) === normalizedDateKey(input.granularity, input.date)
}

function sortKeyMoments(items: KeyMoment[]): KeyMoment[] {
  return [...items].sort((left, right) => {
    const occurredDifference = new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
    if (occurredDifference !== 0) return occurredDifference
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

function trimCache(): void {
  while (cachedQueries.size > MAX_CACHED_KEY_MOMENT_QUERIES) {
    const oldestKey = cachedQueries.keys().next().value as string | undefined
    if (!oldestKey) return
    cachedQueries.delete(oldestKey)
  }
}

export function getKeyMomentDataRevision(): number {
  return keyMomentDataRevision
}

export function getCachedKeyMoments(input: KeyMomentQuery): {
  items: KeyMoment[]
  fresh: boolean
} | null {
  const key = keyMomentQueryKey(input)
  const cached = cachedQueries.get(key)
  if (!cached) return null
  cachedQueries.delete(key)
  cachedQueries.set(key, cached)
  return {
    items: cloneKeyMoments(cached.items),
    fresh: Date.now() - cached.cachedAt < KEY_MOMENT_CACHE_FRESH_MS
  }
}

export function cacheKeyMoments(input: KeyMomentQuery, items: KeyMoment[]): void {
  const key = keyMomentQueryKey(input)
  cachedQueries.delete(key)
  cachedQueries.set(key, {
    input: { ...input },
    items: sortKeyMoments(cloneKeyMoments(items)),
    cachedAt: Date.now()
  })
  trimCache()
}

export function updateCachedKeyMoment(item: KeyMoment): number {
  for (const [key, cached] of cachedQueries) {
    const previouslyCached = cached.items.some((entry) => entry.id === item.id)
    const matches = itemMatchesQuery(item, cached.input)
    if (!previouslyCached && !matches) continue
    const items = cached.items.filter((entry) => entry.id !== item.id)
    if (matches) items.push(cloneKeyMoment(item))
    cachedQueries.set(key, {
      ...cached,
      items: sortKeyMoments(items),
      cachedAt: Date.now()
    })
  }
  keyMomentDataRevision += 1
  return keyMomentDataRevision
}

export function removeCachedKeyMoment(id: string): number {
  for (const [key, cached] of cachedQueries) {
    if (!cached.items.some((item) => item.id === id)) continue
    cachedQueries.set(key, {
      ...cached,
      items: cached.items.filter((item) => item.id !== id),
      cachedAt: Date.now()
    })
  }
  keyMomentDataRevision += 1
  return keyMomentDataRevision
}

export function clearKeyMomentDataCache(): void {
  cachedQueries.clear()
  keyMomentDataRevision += 1
}

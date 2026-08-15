import type {
  KeyMoment,
  KeyMomentContext,
  KeyMomentGranularity,
  KeyMomentPage
} from "../../../types/key-moments"
import {
  cacheKeyMoments,
  getCachedKeyMoments,
  getKeyMomentDataRevision,
  keyMomentQueryKey,
  removeCachedKeyMoment,
  updateCachedKeyMoment
} from "../../../utils/key-moment-data-cache"
import { request, upload } from "../../../services/request"

type KeyMomentQuery = {
  granularity: KeyMomentGranularity
  date: string
}

type CacheReadOptions = {
  forceRefresh?: boolean
  cursor?: string
}

type PendingKeyMomentRequest = {
  revision: number
  promise: Promise<KeyMomentPage>
}

const pendingKeyMomentRequests = new Map<string, PendingKeyMomentRequest>()

function queryString(values: Record<string, string>): string {
  return `?${Object.keys(values)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key])}`)
    .join("&")}`
}

export async function listKeyMoments(
  input: KeyMomentQuery,
  options: CacheReadOptions = {}
): Promise<KeyMomentPage> {
  const cached = options.forceRefresh || options.cursor ? null : getCachedKeyMoments(input)
  if (cached?.fresh) {
    return { items: cached.items, has_more: Boolean(cached.nextCursor), next_cursor: cached.nextCursor }
  }

  const key = `${keyMomentQueryKey(input)}:${options.cursor || "first"}`
  const revision = getKeyMomentDataRevision()
  const existingRequest = pendingKeyMomentRequests.get(key)
  if (existingRequest?.revision === revision) return existingRequest.promise

  const currentRequest: PendingKeyMomentRequest = {
    revision,
    promise: request<KeyMomentPage>({
      path: `/api/key-moments${queryString({
        ...input,
        page_size: "40",
        ...(options.cursor ? { cursor: options.cursor } : {})
      })}`
    }).then((data) => {
      if (!options.cursor && revision === getKeyMomentDataRevision()) {
        cacheKeyMoments(input, data.items, data.next_cursor)
        const stored = getCachedKeyMoments(input)
        return {
          items: stored?.items || [],
          has_more: Boolean(stored?.nextCursor),
          next_cursor: stored?.nextCursor || ""
        }
      }
      return data
    })
  }
  pendingKeyMomentRequests.set(key, currentRequest)
  try {
    return await currentRequest.promise
  } finally {
    if (pendingKeyMomentRequests.get(key) === currentRequest) {
      pendingKeyMomentRequests.delete(key)
    }
  }
}

export async function readKeyMoment(id: string): Promise<KeyMoment> {
  const data = await request<{ item: KeyMoment }>({
    path: `/api/key-moments/${encodeURIComponent(id)}`
  })
  return data.item
}

export function getKeyMomentContext(id: string): Promise<KeyMomentContext> {
  return request<KeyMomentContext>({
    path: `/api/key-moments/${encodeURIComponent(id)}/context${queryString({ page_size: "8" })}`
  })
}

export function listKeyMomentFeed(input: {
  cursor: string
  direction: "newer" | "older"
}): Promise<KeyMomentPage> {
  return request<KeyMomentPage>({
    path: `/api/key-moments/feed${queryString({
      cursor: input.cursor,
      direction: input.direction,
      page_size: "8"
    })}`
  })
}

export async function createKeyMomentDraft(): Promise<string> {
  const data = await request<{ id: string }>({
    path: "/api/key-moments/drafts",
    method: "POST"
  })
  return data.id
}

export async function stageNewKeyMomentImage(id: string, imagePath: string): Promise<string> {
  const data = await upload<{ image_path: string }>({
    path: `/api/key-moments/drafts/${id}/images`,
    filePath: imagePath
  })
  return data.image_path
}

export async function discardNewKeyMomentImages(id: string, imagePaths: string[]): Promise<void> {
  if (!imagePaths.length) return
  await request<{ discarded: boolean }>({
    path: `/api/key-moments/drafts/${id}/images`,
    method: "DELETE",
    data: { image_paths: imagePaths }
  })
}

export async function createKeyMoment(input: {
  id?: string
  content: string
  occurredAt: string
  imagePaths?: string[]
}): Promise<KeyMoment> {
  const data = await request<{ item: KeyMoment }>({
    path: "/api/key-moments",
    method: "POST",
    data: {
      ...(input.id ? { id: input.id } : {}),
      content: input.content,
      occurred_at: input.occurredAt,
      image_paths: input.imagePaths || []
    }
  })
  updateCachedKeyMoment(data.item)
  return data.item
}

export async function updateKeyMoment(
  id: string,
  input: { content: string; imagePaths?: string[] }
): Promise<KeyMoment> {
  const data = await request<{ item: KeyMoment }>({
    path: `/api/key-moments/${id}`,
    method: "PUT",
    data: {
      content: input.content,
      ...(input.imagePaths ? { image_paths: input.imagePaths } : {})
    }
  })
  updateCachedKeyMoment(data.item)
  return data.item
}

export async function stageKeyMomentImage(
  id: string,
  imagePath: string,
  replacedImagePaths: string[] = []
): Promise<string> {
  const data = await upload<{ image_path: string }>({
    path: `/api/key-moments/${id}/images/stage`,
    filePath: imagePath,
    formData: replacedImagePaths.length
      ? { replaced_paths: JSON.stringify(replacedImagePaths) }
      : undefined
  })
  return data.image_path
}

export async function discardStagedKeyMomentImages(
  id: string,
  imagePaths: string[]
): Promise<void> {
  if (!imagePaths.length) return
  await request<{ discarded: boolean }>({
    path: `/api/key-moments/${id}/images/staged`,
    method: "DELETE",
    data: { image_paths: imagePaths }
  })
}

export async function deleteKeyMoment(id: string): Promise<void> {
  await request<void>({ path: `/api/key-moments/${id}`, method: "DELETE" })
  removeCachedKeyMoment(id)
}

import type { KeyMoment, KeyMomentGranularity } from "../types/key-moments"
import type { ImageCrop } from "../types/images"
import {
  cacheKeyMoments,
  getCachedKeyMoments,
  getKeyMomentDataRevision,
  keyMomentQueryKey,
  removeCachedKeyMoment,
  updateCachedKeyMoment
} from "../utils/key-moment-data-cache"
import { request, upload } from "./request"

type KeyMomentQuery = {
  granularity: KeyMomentGranularity
  date: string
}

type CacheReadOptions = {
  forceRefresh?: boolean
}

type PendingKeyMomentRequest = {
  revision: number
  promise: Promise<KeyMoment[]>
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
): Promise<KeyMoment[]> {
  const cached = options.forceRefresh ? null : getCachedKeyMoments(input)
  if (cached?.fresh) return cached.items

  const key = keyMomentQueryKey(input)
  const revision = getKeyMomentDataRevision()
  const existingRequest = pendingKeyMomentRequests.get(key)
  if (existingRequest?.revision === revision) return existingRequest.promise

  const currentRequest: PendingKeyMomentRequest = {
    revision,
    promise: request<{ items: KeyMoment[] }>({
      path: `/api/key-moments${queryString(input)}`
    }).then((data) => {
      if (revision === getKeyMomentDataRevision()) {
        cacheKeyMoments(input, data.items)
        return getCachedKeyMoments(input)?.items || []
      }
      return getCachedKeyMoments(input)?.items || data.items
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

export async function listKeyMomentFeed(date: string): Promise<KeyMoment[]> {
  const data = await request<{ items: KeyMoment[] }>({
    path: `/api/key-moments/feed${queryString({ date })}`
  })
  return data.items
}

export async function createKeyMoment(input: {
  content: string
  occurredAt: string
  imagePath?: string
  imageCrop?: ImageCrop | null
}): Promise<KeyMoment> {
  if (input.imagePath) {
    const data = await upload<{ item: KeyMoment }>({
      path: "/api/key-moments",
      filePath: input.imagePath,
      imageCrop: input.imageCrop,
      formData: {
        content: input.content,
        occurred_at: input.occurredAt
      }
    })
    updateCachedKeyMoment(data.item)
    return data.item
  }
  const data = await request<{ item: KeyMoment }>({
    path: "/api/key-moments",
    method: "POST",
    data: { content: input.content, occurred_at: input.occurredAt }
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

export async function appendKeyMomentImage(
  id: string,
  imagePath: string,
  imageCrop?: ImageCrop | null
): Promise<KeyMoment> {
  const data = await upload<{ item: KeyMoment }>({
    path: `/api/key-moments/${id}/images`,
    filePath: imagePath,
    imageCrop
  })
  updateCachedKeyMoment(data.item)
  return data.item
}

export async function deleteKeyMoment(id: string): Promise<void> {
  await request<void>({ path: `/api/key-moments/${id}`, method: "DELETE" })
  removeCachedKeyMoment(id)
}

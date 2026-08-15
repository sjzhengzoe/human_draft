import type { ImageStorageUsage } from "../types/api"
import { getImageStorageRevision } from "./image-storage-revision"
import { request } from "./request"
import { getStoredSession } from "./session"

const STORAGE_USAGE_CACHE_TTL_MS = 5 * 60 * 1000

type StorageUsageCache = {
  uid: string
  revision: number
  cachedAt: number
  usage: ImageStorageUsage
}

type PendingStorageUsage = {
  uid: string
  revision: number
  promise: Promise<ImageStorageUsage>
}

let storageUsageCache: StorageUsageCache | null = null
let pendingStorageUsage: PendingStorageUsage | null = null

function getCurrentUid(): string {
  return getStoredSession()?.user.uid || ""
}

export function getCachedImageStorageUsage(): ImageStorageUsage | null {
  const uid = getCurrentUid()
  const revision = getImageStorageRevision()
  if (
    !uid
    || !storageUsageCache
    || storageUsageCache.uid !== uid
    || storageUsageCache.revision !== revision
    || Date.now() - storageUsageCache.cachedAt >= STORAGE_USAGE_CACHE_TTL_MS
  ) {
    return null
  }
  return storageUsageCache.usage
}

export function getImageStorageUsage(): Promise<ImageStorageUsage> {
  const cached = getCachedImageStorageUsage()
  if (cached) return Promise.resolve(cached)

  const uid = getCurrentUid()
  const revision = getImageStorageRevision()
  if (
    pendingStorageUsage
    && pendingStorageUsage.uid === uid
    && pendingStorageUsage.revision === revision
  ) {
    return pendingStorageUsage.promise
  }

  const promise = request<ImageStorageUsage>({ path: "/api/auth/storage-usage" })
    .then((usage) => {
      if (uid && uid === getCurrentUid() && revision === getImageStorageRevision()) {
        storageUsageCache = { uid, revision, cachedAt: Date.now(), usage }
      }
      return usage
    })
    .finally(() => {
      if (pendingStorageUsage?.promise === promise) pendingStorageUsage = null
    })

  pendingStorageUsage = { uid, revision, promise }
  return promise
}

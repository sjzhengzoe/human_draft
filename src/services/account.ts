import type { ImageStorageUsage } from "../types/api"
import { request } from "./request"

export function getImageStorageUsage(): Promise<ImageStorageUsage> {
  return request<ImageStorageUsage>({ path: "/api/auth/storage-usage" })
}

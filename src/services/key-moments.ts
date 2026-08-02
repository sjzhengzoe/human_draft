import type { KeyMoment, KeyMomentGranularity } from "../types/key-moments"
import { request, upload } from "./request"

function queryString(values: Record<string, string>): string {
  return `?${Object.keys(values)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(values[key])}`)
    .join("&")}`
}

export async function listKeyMoments(input: {
  granularity: KeyMomentGranularity
  date: string
}): Promise<KeyMoment[]> {
  const data = await request<{ items: KeyMoment[] }>({
    path: `/api/key-moments${queryString(input)}`
  })
  return data.items
}

export async function createKeyMoment(input: {
  content: string
  occurredAt: string
  imagePath?: string
}): Promise<KeyMoment> {
  if (input.imagePath) {
    const data = await upload<{ item: KeyMoment }>({
      path: "/api/key-moments",
      filePath: input.imagePath,
      formData: {
        content: input.content,
        occurred_at: input.occurredAt
      }
    })
    return data.item
  }
  const data = await request<{ item: KeyMoment }>({
    path: "/api/key-moments",
    method: "POST",
    data: { content: input.content, occurred_at: input.occurredAt }
  })
  return data.item
}

export async function updateKeyMoment(
  id: string,
  input: { content: string; occurredAt: string }
): Promise<KeyMoment> {
  const data = await request<{ item: KeyMoment }>({
    path: `/api/key-moments/${id}`,
    method: "PUT",
    data: { content: input.content, occurred_at: input.occurredAt }
  })
  return data.item
}

export async function replaceKeyMomentImage(id: string, imagePath: string): Promise<KeyMoment> {
  const data = await upload<{ item: KeyMoment }>({
    path: `/api/key-moments/${id}/image`,
    filePath: imagePath
  })
  return data.item
}

export async function deleteKeyMomentImage(id: string): Promise<KeyMoment> {
  const data = await request<{ item: KeyMoment }>({
    path: `/api/key-moments/${id}/image`,
    method: "DELETE"
  })
  return data.item
}

export function deleteKeyMoment(id: string): Promise<void> {
  return request<void>({ path: `/api/key-moments/${id}`, method: "DELETE" })
}

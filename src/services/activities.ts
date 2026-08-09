import type { ActivityItem, ActivityType } from "../types/activities"
import { queryString } from "./query-string"
import { request, upload } from "./request"

export async function listActivityItems(activityType: ActivityType): Promise<ActivityItem[]> {
  const data = await request<{ items: ActivityItem[] }>({
    path: `/api/activities${queryString({ activity_type: activityType })}`
  })
  return data.items
}

export async function createActivityItem(
  input: {
    name: string
    introduction: string
    activityType: ActivityType
    imagePath?: string
  }
): Promise<ActivityItem> {
  const payload = {
    name: input.name,
    introduction: input.introduction,
    activity_type: input.activityType
  }
  const data = input.imagePath
    ? await upload<{ item: ActivityItem }>({
      path: "/api/activities",
      filePath: input.imagePath,
      formData: payload
    })
    : await request<{ item: ActivityItem }>({
      path: "/api/activities",
      method: "POST",
      data: payload
    })
  return data.item
}

export async function updateActivityItem(
  id: string,
  input: {
    name: string
    introduction: string
    activityType: ActivityType
  }
): Promise<ActivityItem> {
  const data = await request<{ item: ActivityItem }>({
    path: `/api/activities/${id}`,
    method: "PUT",
    data: {
      name: input.name,
      introduction: input.introduction,
      activity_type: input.activityType
    }
  })
  return data.item
}

export async function replaceActivityItemImage(
  id: string,
  imagePath: string
): Promise<ActivityItem> {
  const data = await upload<{ item: ActivityItem }>({
    path: `/api/activities/${id}/image`,
    filePath: imagePath
  })
  return data.item
}

export function deleteActivityItem(id: string): Promise<void> {
  return request<void>({ path: `/api/activities/${id}`, method: "DELETE" })
}

export function swapActivityItemSortOrders(sourceId: string, targetId: string): Promise<void> {
  return request<void>({
    path: "/api/activities/order/swap",
    method: "PUT",
    data: { source_id: sourceId, target_id: targetId }
  })
}

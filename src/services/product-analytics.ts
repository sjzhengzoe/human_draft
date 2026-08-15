import type { ProductAnalyticsDashboard } from "../types/api"
import { request } from "./request"

export function getProductAnalytics(days: number): Promise<ProductAnalyticsDashboard> {
  return request<ProductAnalyticsDashboard>({
    path: `/api/admin/analytics?days=${days}`
  })
}

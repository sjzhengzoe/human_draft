import { getCurrentUser } from "./auth"
import { getProductAttribution } from "./analytics-context"
import { request } from "./request"

type AnalyticsModule =
  | "home"
  | "menu"
  | "media"
  | "activities"
  | "chat_topics"
  | "text_card"
  | "exercise"
  | "luggage"
  | "wardrobe"
  | "key_moments"
  | "footprint"
  | "profile"

const MODULE_SESSION_MS = 30 * 60 * 1000
const sentModuleBuckets = new Set<string>()

const ROUTE_MODULES: Array<[string, AnalyticsModule]> = [
  ["pages/create/", "home"],
  ["pages/menu/", "menu"],
  ["pages/media/", "media"],
  ["pages/activities/", "activities"],
  ["pages/chat-topics/", "chat_topics"],
  ["pages/text-card/", "text_card"],
  ["pages/editor/", "text_card"],
  ["exercise/pages/", "exercise"],
  ["pages/luggage/", "luggage"],
  ["pages/wardrobe/", "wardrobe"],
  ["pages/key-moments/", "key_moments"],
  ["pages/footprint/", "footprint"],
  ["pages/settings/", "profile"]
]

export function analyticsModuleForRoute(route: string): AnalyticsModule | null {
  const normalized = route.replace(/^\//, "")
  return ROUTE_MODULES.find(([prefix]) => normalized.startsWith(prefix))?.[1] || null
}

export function trackCurrentModuleOpen(): void {
  if (!getCurrentUser()) return
  const pages = getCurrentPages()
  const route = pages[pages.length - 1]?.route || ""
  const module = analyticsModuleForRoute(route)
  if (!module) return
  const bucket = Math.floor(Date.now() / MODULE_SESSION_MS)
  const key = `${module}:${bucket}`
  if (sentModuleBuckets.has(key)) return
  sentModuleBuckets.add(key)
  void request<{ accepted: boolean }>({
    path: "/api/analytics/events",
    method: "POST",
    data: {
      module,
      ...getProductAttribution()
    }
  }).catch(() => {
    sentModuleBuckets.delete(key)
  })
}

export function trackTextCardCreated(): void {
  if (!getCurrentUser()) return
  void request<{ accepted: boolean }>({
    path: "/api/analytics/events",
    method: "POST",
    data: {
      event_name: "content_created",
      module: "text_card"
    }
  }).catch(() => undefined)
}

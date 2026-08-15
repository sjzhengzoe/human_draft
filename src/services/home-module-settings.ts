import type { HomeModuleSettings } from "../types/api"
import {
  HOME_FEATURE_GROUPS,
  applyHiddenHomeModuleKeys,
  getHiddenHomeModuleKeys
} from "../utils/home-modules"
import { request } from "./request"
import { getStoredSession } from "./session"

const LEGACY_STORAGE_KEY = "HIDDEN_HOME_MODULE_KEYS_V1"

type SettingsCache = {
  sessionKey: string
  hiddenModuleKeys: string[]
}

type PendingSettings = {
  sessionKey: string
  promise: Promise<string[]>
}

let settingsCache: SettingsCache | null = null
let pendingSettings: PendingSettings | null = null

function getSessionKey(): string {
  const session = getStoredSession()
  return session ? `${session.user.uid}|${session.token}` : ""
}

function getKnownModuleKeys(): string[] {
  return HOME_FEATURE_GROUPS.flatMap(
    (group: { items: Array<{ key: string }> }) => group.items.map((item) => item.key)
  )
}

function normalizeHiddenModuleKeys(value: unknown): string[] {
  const requestedKeys = new Set(Array.isArray(value) ? value : [])
  const keys = getKnownModuleKeys().filter((key) => requestedKeys.has(key))
  if (keys.length === getKnownModuleKeys().length) keys.shift()
  return keys
}

function readLegacyHiddenModuleKeys(): string[] | null {
  const stored = wx.getStorageSync(LEGACY_STORAGE_KEY) as unknown
  return Array.isArray(stored) ? normalizeHiddenModuleKeys(stored) : null
}

function rememberSettings(sessionKey: string, hiddenModuleKeys: string[]): string[] {
  const normalized = normalizeHiddenModuleKeys(hiddenModuleKeys)
  if (sessionKey === getSessionKey()) {
    settingsCache = { sessionKey, hiddenModuleKeys: normalized }
    applyHiddenHomeModuleKeys(normalized)
  }
  return normalized
}

function requestSettings(): Promise<HomeModuleSettings> {
  return request<HomeModuleSettings>({ path: "/api/auth/home-modules" })
}

function updateSettings(hiddenModuleKeys: string[]): Promise<HomeModuleSettings> {
  return request<HomeModuleSettings>({
    path: "/api/auth/home-modules",
    method: "PUT",
    data: { hidden_module_keys: normalizeHiddenModuleKeys(hiddenModuleKeys) }
  })
}

export function resetHomeModuleSettings(): void {
  applyHiddenHomeModuleKeys([])
}

export async function loadHomeModuleSettings(): Promise<string[]> {
  const sessionKey = getSessionKey()
  if (!sessionKey) {
    resetHomeModuleSettings()
    return []
  }
  if (settingsCache?.sessionKey === sessionKey) {
    applyHiddenHomeModuleKeys(settingsCache.hiddenModuleKeys)
    return [...settingsCache.hiddenModuleKeys]
  }
  if (pendingSettings?.sessionKey === sessionKey) return pendingSettings.promise

  const promise = requestSettings()
    .then(async (settings) => {
      const legacyKeys = readLegacyHiddenModuleKeys()
      const nextSettings = !settings.configured && legacyKeys
        ? await updateSettings(legacyKeys)
        : settings
      wx.removeStorageSync(LEGACY_STORAGE_KEY)
      return rememberSettings(sessionKey, nextSettings.hidden_module_keys)
    })
    .finally(() => {
      if (pendingSettings?.promise === promise) pendingSettings = null
    })

  pendingSettings = { sessionKey, promise }
  return promise
}

export async function saveHomeModuleSettings(): Promise<string[]> {
  const sessionKey = getSessionKey()
  if (!sessionKey) throw new Error("请先登录。")
  const settings = await updateSettings(getHiddenHomeModuleKeys())
  return rememberSettings(sessionKey, settings.hidden_module_keys)
}

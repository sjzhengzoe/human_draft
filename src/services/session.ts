import type { AuthSession } from "../types/api"

const SESSION_STORAGE_KEY = "EARTH_AUTH_SESSION"

export function getStoredSession(): AuthSession | null {
  const stored = wx.getStorageSync(SESSION_STORAGE_KEY) as AuthSession | undefined
  if (
    !stored
    || typeof stored.token !== "string"
    || typeof stored.refresh_token !== "string"
    || !stored.refresh_token.startsWith("r1.")
    || typeof stored.refresh_expires_at !== "string"
    || !stored.user
    || typeof stored.user.uid !== "string"
    || !/^(?:10000|20000|[1-9]\d{9})$/.test(stored.user.uid)
  ) {
    clearStoredSession()
    return null
  }
  if (
    typeof stored.user.display_name !== "string" ||
    !stored.user.display_name.trim()
  ) {
    clearStoredSession()
    return null
  }
  if (typeof stored.user.avatar_url !== "string") stored.user.avatar_url = ""
  if (typeof stored.user.is_admin !== "boolean") {
    stored.user.is_admin = stored.user.can_write === true
  }
  if (!stored.user.access) {
    stored.user.access = {
      registration_cohort: "public_beta",
      service_stage: "public_beta",
      display_label: "公测体验中",
      billing_visible: false,
      paid_features_visible: false
    }
  }
  stored.user.can_write = true
  if (Date.parse(stored.refresh_expires_at) <= Date.now() + 60_000) {
    clearStoredSession()
    return null
  }
  return stored
}

export function setStoredSession(session: AuthSession): void {
  wx.setStorageSync(SESSION_STORAGE_KEY, session)
}

export function clearStoredSession(expectedToken?: string): boolean {
  if (expectedToken !== undefined) {
    const stored = wx.getStorageSync(SESSION_STORAGE_KEY) as AuthSession | undefined
    if (!stored || stored.token !== expectedToken) return false
  }
  wx.removeStorageSync(SESSION_STORAGE_KEY)
  return true
}

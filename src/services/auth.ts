import { API_BASE_URL } from "../config/env"
import type { ApiEnvelope, AppUser, AuthSession } from "../types/api"
import { clearKeyMomentDataCache } from "../utils/key-moment-data-cache"
import { clearLuggageDataCache } from "../utils/luggage-data-cache"
import { clearMediaDataCache } from "../utils/media-data-cache"
import { applyHiddenHomeModuleKeys } from "../utils/home-modules"
import { clearStoredSession, getStoredSession, setStoredSession } from "./session"
import { getProductAttribution } from "./analytics-context"

let pendingLogin: Promise<AuthSession> | null = null
let pendingRefresh: Promise<AuthSession> | null = null
let redirectingToLogin = false

function callbackError(result: WechatMiniprogram.GeneralCallbackResult, fallback: string): Error {
  return new Error(result.errMsg || fallback)
}

export function getWechatLoginCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) resolve(result.code)
        else reject(new Error("微信没有返回登录凭证。"))
      },
      fail(result) {
        reject(callbackError(result, "无法获取微信登录凭证。"))
      }
    })
  })
}

function requestWechatSession(code: string): Promise<AuthSession> {
  return new Promise((resolve, reject) => {
    wx.request<ApiEnvelope<AuthSession>>({
      url: `${API_BASE_URL}/api/auth/wechat`,
      method: "POST",
      data: { code, ...getProductAttribution() },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data.data) {
          resolve(response.data.data)
          return
        }
        reject(new Error(response.data.error?.message || `登录失败（${response.statusCode}）`))
      },
      fail(result) {
        reject(callbackError(result, "无法连接登录服务。"))
      }
    })
  })
}

function requestRefreshedSession(refreshToken: string): Promise<AuthSession> {
  return new Promise((resolve, reject) => {
    wx.request<ApiEnvelope<AuthSession>>({
      url: `${API_BASE_URL}/api/auth/refresh`,
      method: "POST",
      data: { refresh_token: refreshToken },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.data.data) {
          resolve(response.data.data)
          return
        }
        reject(new Error(response.data.error?.message || "登录已过期，请重新登录。"))
      },
      fail(result) {
        reject(callbackError(result, "无法刷新登录状态。"))
      }
    })
  })
}

async function runLogin(): Promise<AuthSession> {
  if (pendingLogin) return pendingLogin

  pendingLogin = (async () => {
    const code = await getWechatLoginCode()
    const session = await requestWechatSession(code)
    setStoredSession(session)
    redirectingToLogin = false
    return session
  })()

  try {
    return await pendingLogin
  } finally {
    pendingLogin = null
  }
}

export function loginExistingUser(): Promise<AuthSession> {
  return runLogin()
}

export async function refreshLoginSession(expectedRefreshToken?: string): Promise<AuthSession> {
  if (pendingRefresh) return pendingRefresh
  const stored = getStoredSession()
  if (!stored) throw new Error("登录已过期，请重新登录。")
  if (expectedRefreshToken !== undefined && stored.refresh_token !== expectedRefreshToken) {
    return stored
  }
  pendingRefresh = requestRefreshedSession(stored.refresh_token)
    .then((session) => {
      setStoredSession(session)
      getApp<IAppOption>().globalData.currentUser = session.user
      return session
    })
  try {
    return await pendingRefresh
  } catch (error) {
    redirectToLogin(stored.token)
    throw error
  } finally {
    pendingRefresh = null
  }
}

export function redirectToLogin(expectedToken?: string): void {
  if (!clearStoredSession(expectedToken)) return
  clearLocalAccountState()

  const pages = getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route
  if (currentRoute === "pages/login/index" || redirectingToLogin) return
  redirectingToLogin = true
  wx.reLaunch({
    url: "/pages/login/index",
    complete: () => {
      redirectingToLogin = false
    }
  })
}

export function clearLocalAccountState(): void {
  clearStoredSession()
  clearLuggageDataCache()
  clearMediaDataCache()
  clearKeyMomentDataCache()
  applyHiddenHomeModuleKeys([])
  try {
    getApp<IAppOption>().globalData.currentUser = null
  } catch (_error) {
    // App 初始化早期可能还取不到实例。
  }
}

export async function ensureLogin(): Promise<AuthSession> {
  const stored = getStoredSession()
  if (stored && Date.parse(stored.expires_at) > Date.now() + 60_000) return stored
  if (stored) return refreshLoginSession(stored.refresh_token)
  redirectToLogin()
  throw new Error("请先登录。")
}

export function getCurrentUser(): AppUser | null {
  return getStoredSession()?.user || null
}

export function replaceCurrentUser(user: AppUser): void {
  const session = getStoredSession()
  if (!session) return
  setStoredSession({ ...session, user })
  try {
    getApp<IAppOption>().globalData.currentUser = user
  } catch (_error) {
    // App 初始化早期可能还取不到实例。
  }
}

export async function logout(): Promise<void> {
  const session = getStoredSession()
  if (session) {
    await new Promise<void>((resolve) => {
      wx.request({
        url: `${API_BASE_URL}/api/auth/logout`,
        method: "POST",
        data: { refresh_token: session.refresh_token },
        complete: () => resolve()
      })
    })
  }
  clearLocalAccountState()
}

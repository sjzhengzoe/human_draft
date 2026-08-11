import { API_BASE_URL } from "../config/env"
import type { ApiEnvelope, AppUser, AuthSession } from "../types/api"
import { clearKeyMomentDataCache } from "../utils/key-moment-data-cache"
import { clearLuggageDataCache } from "../utils/luggage-data-cache"
import { clearMediaDataCache } from "../utils/media-data-cache"
import { clearStoredSession, getStoredSession, setStoredSession } from "./session"

let pendingLogin: Promise<AuthSession> | null = null
let redirectingToLogin = false

function callbackError(result: WechatMiniprogram.GeneralCallbackResult, fallback: string): Error {
  return new Error(result.errMsg || fallback)
}

function wxLogin(): Promise<string> {
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
      data: { code },
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

async function runLogin(): Promise<AuthSession> {
  if (pendingLogin) return pendingLogin

  pendingLogin = (async () => {
    const code = await wxLogin()
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

export function redirectToLogin(expectedToken?: string): void {
  if (!clearStoredSession(expectedToken)) return
  clearLuggageDataCache()
  clearMediaDataCache()
  clearKeyMomentDataCache()
  try {
    getApp<IAppOption>().globalData.currentUser = null
  } catch (_error) {
    // App 初始化早期可能还取不到实例。
  }

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

export async function ensureLogin(): Promise<AuthSession> {
  const stored = getStoredSession()
  if (stored) return stored
  redirectToLogin()
  throw new Error("请先登录。")
}

export function getCurrentUser(): AppUser | null {
  return getStoredSession()?.user || null
}

export async function logout(): Promise<void> {
  const session = getStoredSession()
  if (session) {
    await new Promise<void>((resolve) => {
      wx.request({
        url: `${API_BASE_URL}/api/auth/logout`,
        method: "POST",
        header: { Authorization: `Bearer ${session.token}` },
        complete: () => resolve()
      })
    })
  }
  clearStoredSession()
  clearLuggageDataCache()
  clearMediaDataCache()
  clearKeyMomentDataCache()
  try {
    getApp<IAppOption>().globalData.currentUser = null
  } catch (_error) {
    // 忽略 App 销毁阶段的取值失败。
  }
}

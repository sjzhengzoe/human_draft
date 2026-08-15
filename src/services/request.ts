import { API_BASE_URL } from "../config/env"
import type { ApiEnvelope } from "../types/api"
import type { ImageCrop } from "../types/images"
import { ensureLogin, redirectToLogin, refreshLoginSession } from "./auth"
import { invalidateImageStorageUsage } from "./image-storage-revision"

export class ApiRequestError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(message: string, code = "REQUEST_FAILED", statusCode = 0) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.statusCode = statusCode
  }
}

type RequestOptions = {
  path: string
  method?: "GET" | "POST" | "PUT" | "DELETE"
  data?: WechatMiniprogram.IAnyObject | string | ArrayBuffer
}

function toApiEnvelope<T>(value: unknown): ApiEnvelope<T> {
  if (value !== null && typeof value === "object") {
    return value as ApiEnvelope<T>
  }
  return { ok: false }
}

async function sendRequest<T>(options: RequestOptions, canRefresh = true): Promise<T> {
  const session = await ensureLogin()
  const response = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult<ApiEnvelope<T>>>(
    (resolve, reject) => {
      wx.request<ApiEnvelope<T>>({
        url: `${API_BASE_URL}${options.path}`,
        method: options.method || "GET",
        data:
          options.data === undefined && options.method && options.method !== "GET"
            ? {}
            : options.data,
        header: { Authorization: `Bearer ${session.token}` },
        success: resolve,
        fail: reject
      })
    }
  )
  const body = toApiEnvelope<T>(response.data)

  if (response.statusCode === 401) {
    if (canRefresh) {
      try {
        await refreshLoginSession(session.refresh_token)
        return sendRequest<T>(options, false)
      } catch (_error) {
        // 统一执行下面的登录失效处理。
      }
    }
    redirectToLogin(session.token)
    throw new ApiRequestError(
      body.error?.message || "登录已过期，请重新登录。",
      body.error?.code || "UNAUTHORIZED",
      response.statusCode
    )
  }
  if (response.statusCode >= 200 && response.statusCode < 300) {
    if (options.method === "DELETE") invalidateImageStorageUsage()
    if (response.statusCode === 204) return undefined as T
    return body.data as T
  }
  throw new ApiRequestError(
    body.error?.message || "请求失败，请稍后重试。",
    body.error?.code,
    response.statusCode
  )
}

export function request<T>(options: RequestOptions): Promise<T> {
  return sendRequest<T>(options)
}

export async function publicRequest<T>(options: RequestOptions): Promise<T> {
  const response = await new Promise<WechatMiniprogram.RequestSuccessCallbackResult<ApiEnvelope<T>>>(
    (resolve, reject) => {
      wx.request<ApiEnvelope<T>>({
        url: `${API_BASE_URL}${options.path}`,
        method: options.method || "GET",
        data:
          options.data === undefined && options.method && options.method !== "GET"
            ? {}
            : options.data,
        success: resolve,
        fail: reject
      })
    }
  )
  const body = toApiEnvelope<T>(response.data)
  if (response.statusCode >= 200 && response.statusCode < 300) {
    if (response.statusCode === 204) return undefined as T
    return body.data as T
  }
  throw new ApiRequestError(
    body.error?.message || "请求失败，请稍后重试。",
    body.error?.code,
    response.statusCode
  )
}

type UploadOptions = {
  path: string
  filePath: string
  fieldName?: string
  formData?: Record<string, string>
  imageCrop?: ImageCrop | null
}

async function sendUpload<T>(options: UploadOptions, canRefresh = true): Promise<T> {
  const session = await ensureLogin()
  const formData = { ...(options.formData || {}) }
  if (options.imageCrop) formData.image_crop = JSON.stringify(options.imageCrop)
  const response = await new Promise<WechatMiniprogram.UploadFileSuccessCallbackResult>(
    (resolve, reject) => {
      wx.uploadFile({
        url: `${API_BASE_URL}${options.path}`,
        filePath: options.filePath,
        name: options.fieldName || "image",
        formData: Object.keys(formData).length ? formData : undefined,
        header: { Authorization: `Bearer ${session.token}` },
        success: resolve,
        fail: reject
      })
    }
  )
  let body: ApiEnvelope<T> = { ok: false }
  try {
    body = JSON.parse(response.data) as ApiEnvelope<T>
  } catch (_error) {
    // 统一走下面的错误信息。
  }

  if (response.statusCode === 401) {
    if (canRefresh) {
      try {
        await refreshLoginSession(session.refresh_token)
        return sendUpload<T>(options, false)
      } catch (_error) {
        // 统一执行下面的登录失效处理。
      }
    }
    redirectToLogin(session.token)
    throw new ApiRequestError(
      body.error?.message || "登录已过期，请重新登录。",
      body.error?.code || "UNAUTHORIZED",
      response.statusCode
    )
  }
  if (response.statusCode >= 200 && response.statusCode < 300 && body.data) {
    invalidateImageStorageUsage()
    return body.data
  }
  throw new ApiRequestError(
    body.error?.message || "上传失败，请稍后重试。",
    body.error?.code,
    response.statusCode
  )
}

export function upload<T>(options: UploadOptions): Promise<T> {
  return sendUpload<T>(options)
}

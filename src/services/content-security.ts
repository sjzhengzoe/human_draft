import { request } from "./request"
import { getCurrentUser } from "./auth"

export async function checkTextContent(content: string): Promise<void> {
  const normalized = content.trim()
  if (!normalized) return
  // 图文卡片是本地工具。游客没有可用于微信内容安全接口的 OpenID，
  // 因此直接保留本地编辑、预览和导出流程；登录用户仍执行原有检测。
  if (!getCurrentUser()) return

  await request<{ safe: true }>({
    path: "/api/content-security/text",
    method: "POST",
    data: { content: normalized }
  })
}

import { request } from "./request"

export async function checkTextContent(content: string): Promise<void> {
  const normalized = content.trim()
  if (!normalized) return

  await request<{ safe: true }>({
    path: "/api/content-security/text",
    method: "POST",
    data: { content: normalized }
  })
}

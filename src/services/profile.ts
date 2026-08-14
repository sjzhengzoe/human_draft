import type { AppUser } from "../types/api"
import { replaceCurrentUser } from "./auth"
import { request, upload } from "./request"

export async function updateAccountProfile(displayName: string): Promise<AppUser> {
  const data = await request<{ user: AppUser }>({
    path: "/api/auth/profile",
    method: "PUT",
    data: { display_name: displayName }
  })
  replaceCurrentUser(data.user)
  return data.user
}

export async function updateAccountAvatar(filePath: string): Promise<AppUser> {
  const data = await upload<{ user: AppUser }>({
    path: "/api/auth/avatar",
    filePath,
    fieldName: "avatar"
  })
  replaceCurrentUser(data.user)
  return data.user
}

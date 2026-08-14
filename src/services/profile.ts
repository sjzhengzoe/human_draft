import type { AppUser } from "../types/api"
import type { ImageCrop } from "../types/images"
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

export async function updateAccountAvatar(
  filePath: string,
  imageCrop?: ImageCrop | null
): Promise<AppUser> {
  const data = await upload<{ user: AppUser }>({
    path: "/api/auth/avatar",
    filePath,
    imageCrop,
    fieldName: "avatar"
  })
  replaceCurrentUser(data.user)
  return data.user
}

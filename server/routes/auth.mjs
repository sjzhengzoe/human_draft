import {
  getAuthenticatedUser,
  loginWithWechatCode,
  logoutSession,
  refreshSession
} from "../domains/auth/service.mjs"
import {
  readAvatarImage,
  updateUserAvatar,
  updateUserDisplayName
} from "../domains/auth/profile.mjs"
import { getUserImageStorageUsage } from "../domains/shared/image-storage.mjs"

export function registerAuthRoutes(app, context) {
  const {
    authenticated,
    contentSecurity,
    getSupabaseAdmin,
    profileCompletionAuthenticated,
    refreshAuthenticated
  } = context

  app.post("/api/auth/wechat", async (request) => ({
    ok: true,
    data: await loginWithWechatCode(getSupabaseAdmin(), request.body?.code, {
      displayName: request.body?.display_name,
      avatarUrl: request.body?.avatar_url
    })
  }))

  app.post(
    "/api/auth/refresh",
    { preHandler: refreshAuthenticated },
    async (request) => ({
      ok: true,
      data: await refreshSession(getSupabaseAdmin(), request.refreshAuth)
    })
  )

  app.put(
    "/api/auth/profile",
    { preHandler: authenticated },
    async (request) => {
      const displayName = String(request.body?.display_name || "").trim()
      await contentSecurity.checkText(request.auth.user.openid, displayName)
      await updateUserDisplayName(
        getSupabaseAdmin(),
        request.auth.user.uid,
        displayName
      )
      return {
        ok: true,
        data: {
          user: await getAuthenticatedUser(getSupabaseAdmin(), request.auth)
        }
      }
    }
  )

  app.post(
    "/api/auth/avatar",
    { preHandler: profileCompletionAuthenticated },
    async (request) => {
      const avatar = await readAvatarImage(request)
      await contentSecurity.checkImage(avatar)
      const avatarUrl = await updateUserAvatar(
        getSupabaseAdmin(),
        request.auth.user.uid,
        avatar
      )
      const user = await getAuthenticatedUser(getSupabaseAdmin(), request.auth)
      return {
        ok: true,
        data: { user: { ...user, avatar_url: avatarUrl } }
      }
    }
  )

  app.get("/api/auth/me", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { user: await getAuthenticatedUser(getSupabaseAdmin(), request.auth) }
  }))

  app.get(
    "/api/auth/storage-usage",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await getUserImageStorageUsage(
        getSupabaseAdmin(),
        request.auth.user.uid
      )
    })
  )

  app.post(
    "/api/auth/logout",
    { preHandler: refreshAuthenticated },
    async (request) => {
      await logoutSession(getSupabaseAdmin(), request.refreshAuth)
      return { ok: true }
    }
  )
}

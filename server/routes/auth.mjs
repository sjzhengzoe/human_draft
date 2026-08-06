import { loginWithWechatCode, logoutSession } from "../domains/auth/service.mjs"
import { readAvatarImage, updateUserAvatar } from "../domains/auth/profile.mjs"

export function registerAuthRoutes(app, context) {
  const {
    authenticated,
    contentSecurity,
    getSupabaseAdmin,
    profileCompletionAuthenticated
  } = context

  app.post("/api/auth/wechat", async (request) => ({
    ok: true,
    data: await loginWithWechatCode(getSupabaseAdmin(), request.body?.code, {
      displayName: request.body?.display_name,
      avatarUrl: request.body?.avatar_url
    })
  }))

  app.post(
    "/api/auth/avatar",
    { preHandler: profileCompletionAuthenticated },
    async (request) => {
      const avatar = await readAvatarImage(request)
      await contentSecurity.checkImage(avatar)
      const avatarUrl = await updateUserAvatar(
        getSupabaseAdmin(),
        request.auth.user.id,
        avatar
      )
      return {
        ok: true,
        data: { user: { ...request.auth.user, avatar_url: avatarUrl } }
      }
    }
  )

  app.get("/api/auth/me", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { user: request.auth.user }
  }))

  app.post(
    "/api/auth/logout",
    { preHandler: profileCompletionAuthenticated },
    async (request) => {
      await logoutSession(getSupabaseAdmin(), request)
      return { ok: true }
    }
  )
}

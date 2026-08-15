import {
  getAuthenticatedUser,
  loginWithWechatCode,
  logoutSession,
  refreshSession
} from "../domains/auth/service.mjs"
import {
  getUserHomeModuleSettings,
  saveUserHomeModuleSettings
} from "../domains/auth/home-module-settings.mjs"
import {
  readAvatarImage,
  updateUserAvatar,
  updateUserDisplayName
} from "../domains/auth/profile.mjs"
import { getUserImageStorageUsage } from "../domains/shared/image-storage.mjs"
import { assertCondition } from "../lib/errors.mjs"

export function registerAuthRoutes(app, context) {
  const {
    accountDeletion,
    authenticated,
    contentSecurity,
    getSupabaseAdmin,
    profileCompletionAuthenticated,
    refreshAuthenticated
  } = context

  app.post(
    "/api/auth/wechat",
    { config: { allowDuringReadOnly: true } },
    async (request) => {
      const controls = await context.runtimeControls.getSnapshot()
      const registration = controls.registration_enabled
      const authResult = await loginWithWechatCode(
        getSupabaseAdmin(),
        request.body?.code,
        {},
        {
          registrationEnabled: registration.enabled,
          registrationMessage: registration.message
        }
      )
      const { is_new_user: isNewUser, ...session } = authResult
      await context.productAnalytics.recordAuthentication({
        request,
        uid: session.user.uid,
        isNewUser,
        attribution: request.body || {}
      })
      return {
        ok: true,
        data: session
      }
    }
  )

  app.post(
    "/api/auth/refresh",
    {
      config: { allowDuringReadOnly: true },
      preHandler: refreshAuthenticated
    },
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

  app.get(
    "/api/auth/home-modules",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await getUserHomeModuleSettings(
        getSupabaseAdmin(),
        request.auth.user.uid
      )
    })
  )

  app.put(
    "/api/auth/home-modules",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await saveUserHomeModuleSettings(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body?.hidden_module_keys
      )
    })
  )

  app.post(
    "/api/auth/logout",
    {
      config: { allowDuringReadOnly: true },
      preHandler: refreshAuthenticated
    },
    async (request) => {
      await logoutSession(getSupabaseAdmin(), request.refreshAuth)
      return { ok: true }
    }
  )

  app.delete(
    "/api/auth/account",
    {
      config: { allowDuringReadOnly: true },
      preHandler: authenticated
    },
    async (request) => {
      assertCondition(
        request.body?.confirmation === "DELETE_MY_ACCOUNT",
        400,
        "ACCOUNT_DELETION_NOT_CONFIRMED",
        "请重新确认注销账号。"
      )
      return {
        ok: true,
        data: await accountDeletion.deleteAccount({
          uid: request.auth.user.uid,
          openId: request.auth.user.openid,
          code: request.body?.code
        })
      }
    }
  )
}

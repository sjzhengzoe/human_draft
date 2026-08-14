import { assertCondition } from "../lib/errors.mjs"
import { requireAuth, requireRefreshAuth } from "../domains/auth/service.mjs"

export function createAuthGuards(getSupabaseAdmin) {
  const authenticated = async (request) => {
    await requireAuth(getSupabaseAdmin(), request)
  }

  const adminAuthenticated = async (request) => {
    await authenticated(request)
    assertCondition(
      request.auth.user.is_admin,
      403,
      "ADMIN_REQUIRED",
      "只有管理员可以管理官方话题。"
    )
  }

  const profileCompletionAuthenticated = async (request) => {
    await requireAuth(getSupabaseAdmin(), request)
  }

  const refreshAuthenticated = async (request) => {
    await requireRefreshAuth(getSupabaseAdmin(), request)
  }

  return {
    adminAuthenticated,
    authenticated,
    profileCompletionAuthenticated,
    refreshAuthenticated
  }
}

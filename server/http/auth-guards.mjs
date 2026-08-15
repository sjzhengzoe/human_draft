import { assertCondition } from "../lib/errors.mjs"
import { requireAuth, requireRefreshAuth } from "../domains/auth/service.mjs"

export function createAuthGuards(getSupabaseAdmin, rateLimiter) {
  const authenticated = async (request, reply) => {
    await requireAuth(getSupabaseAdmin(), request)
    rateLimiter?.enforceAuthenticated(request, reply)
  }

  const adminAuthenticated = async (request, reply) => {
    await authenticated(request, reply)
    assertCondition(
      request.auth.user.is_admin,
      403,
      "ADMIN_REQUIRED",
      "只有管理员可以执行这项操作。"
    )
  }

  const profileCompletionAuthenticated = async (request, reply) => {
    await requireAuth(getSupabaseAdmin(), request)
    rateLimiter?.enforceAuthenticated(request, reply)
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

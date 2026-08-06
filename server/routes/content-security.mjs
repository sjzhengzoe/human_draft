export function registerContentSecurityRoutes(app, context) {
  const { authenticated, contentSecurity } = context

  app.post(
    "/api/content-security/text",
    { preHandler: authenticated },
    async (request) => {
      await contentSecurity.checkText(
        request.auth.user.openid,
        request.body?.content
      )
      return { ok: true, data: { safe: true } }
    }
  )
}

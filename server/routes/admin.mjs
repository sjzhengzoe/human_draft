import { checkUserText } from "../domains/shared/content-security.mjs";

export function registerAdminRoutes(app, context) {
  const { adminAuthenticated, contentSecurity, productAnalytics, runtimeControls } = context;

  app.get(
    "/api/admin/analytics",
    { preHandler: adminAuthenticated },
    async (request) => ({
      ok: true,
      data: await productAnalytics.getAdminDashboard(request.query || {}),
    }),
  );

  app.get(
    "/api/admin/runtime-controls",
    { preHandler: adminAuthenticated },
    async () => ({
      ok: true,
      data: await runtimeControls.getAdminState(),
    }),
  );

  app.put(
    "/api/admin/runtime-controls/:key",
    {
      config: { allowDuringReadOnly: true },
      preHandler: adminAuthenticated,
    },
    async (request) => {
      await checkUserText(contentSecurity, request.auth.user.openid, request.body?.reason);
      return {
        ok: true,
        data: {
          controls: await runtimeControls.updateControl({
            key: request.params.key,
            enabled: request.body?.enabled,
            reason: request.body?.reason,
            uid: request.auth.user.uid,
          }),
        },
      };
    },
  );
}

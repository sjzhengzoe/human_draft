export function registerAdminRoutes(app, context) {
  const { adminAuthenticated, runtimeControls } = context;

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
    async (request) => ({
      ok: true,
      data: {
        controls: await runtimeControls.updateControl({
          key: request.params.key,
          enabled: request.body?.enabled,
          reason: request.body?.reason,
          uid: request.auth.user.uid,
        }),
      },
    }),
  );
}

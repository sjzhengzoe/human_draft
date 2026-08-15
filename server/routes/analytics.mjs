export function registerAnalyticsRoutes(app, context) {
  const { authenticated, productAnalytics, rateLimiter } = context;

  app.post(
    "/api/analytics/events",
    {
      config: { allowDuringReadOnly: true },
      preHandler: authenticated,
    },
    async (request, reply) => {
      rateLimiter?.enforceAnalytics(request, reply);
      if (request.body?.event_name === "content_created") {
        await productAnalytics.recordClientContentCreation({
          request,
          module: request.body?.module,
        });
      } else {
        await productAnalytics.recordModuleOpen({
          request,
          module: request.body?.module,
          attribution: request.body || {},
        });
      }
      return { ok: true, data: { accepted: true } };
    },
  );
}

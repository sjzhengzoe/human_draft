import {
  listFootprintCityCodes,
  setFootprintCityVisited,
} from "../domains/footprint/service.mjs";

export function registerFootprintRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context;

  app.get("/api/footprint", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      city_codes: await listFootprintCityCodes(
        getSupabaseAdmin(),
        request.auth.user.uid,
      ),
    },
  }));

  app.put(
    "/api/footprint/cities/:cityCode",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await setFootprintCityVisited(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.cityCode,
        request.body || {},
      ),
    }),
  );
}

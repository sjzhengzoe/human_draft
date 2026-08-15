import {
  createFootprintCityPlace,
  deleteFootprintCityPlace,
  listFootprintCityPlaces,
  listFootprintCityCodes,
  setFootprintCityVisited,
  updateFootprintCityPlace,
} from "../domains/footprint/service.mjs";
import { checkUserText } from "../domains/shared/content-security.mjs";

export function registerFootprintRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

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

  app.get(
    "/api/footprint/cities/:cityCode/places",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: {
        items: await listFootprintCityPlaces(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.cityCode,
        ),
      },
    }),
  );

  app.post(
    "/api/footprint/cities/:cityCode/places",
    { preHandler: authenticated },
    async (request, reply) => {
      await checkUserText(
        contentSecurity,
        request.auth.user.openid,
        request.body?.name,
        request.body?.note,
      );
      const item = await createFootprintCityPlace(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.cityCode,
        request.body || {},
      );
      return reply.code(201).send({ ok: true, data: { item } });
    },
  );

  app.put(
    "/api/footprint/places/:placeId",
    { preHandler: authenticated },
    async (request) => {
      await checkUserText(
        contentSecurity,
        request.auth.user.openid,
        request.body?.name,
        request.body?.note,
      );
      return {
        ok: true,
        data: {
          item: await updateFootprintCityPlace(
            getSupabaseAdmin(),
            request.auth.user.uid,
            request.params.placeId,
            request.body || {},
          ),
        },
      };
    },
  );

  app.delete(
    "/api/footprint/places/:placeId",
    { preHandler: authenticated },
    async (request) => {
      await deleteFootprintCityPlace(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.placeId,
      );
      return { ok: true, data: { deleted: true } };
    },
  );
}

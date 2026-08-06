import {
  createDiningPlace,
  createDiningScene,
  deleteDiningPlace,
  deleteDiningScene,
  getDiningPlace,
  getDiningScene,
  listDiningPlaces,
  listDiningScenes,
  swapDiningSceneSortOrders,
  updateDiningPlace,
  updateDiningScene,
} from "../domains/dining/service.mjs";

export function registerDiningRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context;

  app.get("/api/dining", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listDiningPlaces(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.query || {},
      ),
    },
  }));

  app.get("/api/dining-scenes", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listDiningScenes(getSupabaseAdmin(), request.auth.user.id) },
  }));

  app.get("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getDiningScene(getSupabaseAdmin(), request.auth.user.id, request.params.id),
    },
  }));

  app.post("/api/dining-scenes", { preHandler: authenticated }, async (request, reply) =>
    reply.code(201).send({
      ok: true,
      data: {
        item: await createDiningScene(
          getSupabaseAdmin(),
          request.auth.user.id,
          request.body || {},
        ),
      },
    }),
  );

  app.put("/api/dining-scenes/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapDiningSceneSortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateDiningScene(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => {
    await deleteDiningScene(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/dining/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getDiningPlace(getSupabaseAdmin(), request.auth.user.id, request.params.id),
    },
  }));

  app.post("/api/dining", { preHandler: authenticated }, async (request, reply) => {
    const item = await createDiningPlace(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/dining/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateDiningPlace(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/dining/:id", { preHandler: authenticated }, async (request) => {
    await deleteDiningPlace(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

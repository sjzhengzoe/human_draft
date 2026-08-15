import {
  createDiningScene,
  deleteDiningScene,
  getDiningScene,
  listDiningScenes,
  swapDiningSceneSortOrders,
  updateDiningScene,
} from "../domains/dining/service.mjs";

export function registerDiningRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context;

  app.get("/api/dining-scenes", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listDiningScenes(getSupabaseAdmin(), request.auth.user.uid) },
  }));

  app.get("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getDiningScene(getSupabaseAdmin(), request.auth.user.uid, request.params.id),
    },
  }));

  app.post("/api/dining-scenes", { preHandler: authenticated }, async (request, reply) =>
    reply.code(201).send({
      ok: true,
      data: {
        item: await createDiningScene(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.body || {},
        ),
      },
    }),
  );

  app.put("/api/dining-scenes/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapDiningSceneSortOrders(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateDiningScene(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/dining-scenes/:id", { preHandler: authenticated }, async (request) => {
    await deleteDiningScene(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

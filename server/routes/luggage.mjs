import {
  createLuggageGroup,
  createLuggageItem,
  createLuggageScene,
  deleteLuggageGroup,
  deleteLuggageItem,
  deleteLuggageScene,
  listLuggageScenes,
  moveLuggageGroup,
  moveLuggageItem,
  swapLuggageGroupSortOrders,
  updateLuggageGroup,
  updateLuggageItem,
  updateLuggageScene,
} from "../domains/luggage/service.mjs";

export function registerLuggageRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context;

  app.get("/api/luggage", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listLuggageScenes(getSupabaseAdmin(), request.auth.user.id) },
  }));

  app.post("/api/luggage/scenes", { preHandler: authenticated }, async (request, reply) => {
    const item = await createLuggageScene(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/scenes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageScene(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/luggage/scenes/:id", { preHandler: authenticated }, async (request) => {
    await deleteLuggageScene(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.post("/api/luggage/groups", { preHandler: authenticated }, async (request, reply) => {
    const item = await createLuggageGroup(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/groups/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageGroup(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/luggage/groups/:id", { preHandler: authenticated }, async (request) => {
    await deleteLuggageGroup(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.put("/api/luggage/groups/order/swap", { preHandler: authenticated }, async (request) => {
    await swapLuggageGroupSortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return { ok: true, data: { swapped: true } };
  });

  app.put("/api/luggage/groups/order/move", { preHandler: authenticated }, async (request) => {
    await moveLuggageGroup(getSupabaseAdmin(), request.auth.user.id, request.body || {});
    return { ok: true, data: { moved: true } };
  });

  app.post("/api/luggage/items", { preHandler: authenticated }, async (request, reply) => {
    const item = await createLuggageItem(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/items/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageItem(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.put("/api/luggage/items/:id/move", { preHandler: authenticated }, async (request) => {
    await moveLuggageItem(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.params.id,
      request.body || {},
    );
    return { ok: true, data: { moved: true } };
  });

  app.delete("/api/luggage/items/:id", { preHandler: authenticated }, async (request) => {
    await deleteLuggageItem(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

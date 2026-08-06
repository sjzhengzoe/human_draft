import {
  createActivityItem,
  deleteActivityItem,
  listActivityItems,
  swapActivityItemSortOrders,
  updateActivityItem,
} from "../domains/activities/service.mjs";

export function registerActivityRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context;

  app.get("/api/activities", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listActivityItems(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.query || {},
      ),
    },
  }));

  app.post("/api/activities", { preHandler: authenticated }, async (request, reply) => {
    const item = await createActivityItem(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/activities/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapActivityItemSortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/activities/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateActivityItem(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/activities/:id", { preHandler: authenticated }, async (request) => {
    await deleteActivityItem(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

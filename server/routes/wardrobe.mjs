import { readMultipartImage } from "../http/multipart-image.mjs";
import {
  createWardrobeCategory,
  createWardrobeItem,
  deleteWardrobeCategory,
  deleteWardrobeItem,
  getWardrobeCategory,
  getWardrobeItem,
  getWardrobeStats,
  listWardrobeCategories,
  listWardrobeItems,
  replaceWardrobeItemImage,
  reorderWardrobeItems,
  swapWardrobeCategorySortOrders,
  swapWardrobeItemSortOrders,
  updateWardrobeCategory,
  updateWardrobeItem,
} from "../domains/wardrobe/service.mjs";

export function registerWardrobeRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/wardrobe/categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listWardrobeCategories(getSupabaseAdmin(), request.auth.user.uid),
    },
  }));

  app.get("/api/wardrobe/stats", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await getWardrobeStats(getSupabaseAdmin(), request.auth.user.uid),
  }));

  app.get(
    "/api/wardrobe/categories/:id",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: {
        item: await getWardrobeCategory(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
        ),
      },
    }),
  );

  app.post(
    "/api/wardrobe/categories",
    { preHandler: authenticated },
    async (request, reply) => {
      const item = await createWardrobeCategory(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body || {},
      );
      return reply.code(201).send({ ok: true, data: { item } });
    },
  );

  app.put(
    "/api/wardrobe/categories/order/swap",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await swapWardrobeCategorySortOrders(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body || {},
      ),
    }),
  );

  app.put(
    "/api/wardrobe/categories/:id",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: {
        item: await updateWardrobeCategory(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          request.body || {},
        ),
      },
    }),
  );

  app.delete(
    "/api/wardrobe/categories/:id",
    { preHandler: authenticated },
    async (request) => {
      await deleteWardrobeCategory(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      );
      return { ok: true, data: { deleted: true } };
    },
  );

  app.get("/api/wardrobe/items", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listWardrobeItems(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {},
      ),
    },
  }));

  app.get("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getWardrobeItem(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      ),
    },
  }));

  app.post("/api/wardrobe/items", { preHandler: authenticated }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request);
    await contentSecurity.checkImage(image);
    const item = await createWardrobeItem(
      getSupabaseAdmin(),
      request.auth.user.uid,
      fields,
      image,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put(
    "/api/wardrobe/items/order/swap",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await swapWardrobeItemSortOrders(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body || {},
      ),
    }),
  );

  app.put("/api/wardrobe/items/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderWardrobeItems(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateWardrobeItem(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.post("/api/wardrobe/items/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: {
        item: await replaceWardrobeItemImage(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.delete("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => {
    await deleteWardrobeItem(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
    );
    return { ok: true, data: { deleted: true } };
  });
}

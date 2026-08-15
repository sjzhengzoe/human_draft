import {
  addNextMediaEpisode,
  createMediaCategory,
  createMediaEntry,
  createMediaSeason,
  deleteMediaCategory,
  deleteMediaEntry,
  deleteMediaSeason,
  getMediaCategory,
  getMediaEntry,
  getMediaEpisode,
  listFavoriteMediaEpisodes,
  listMediaCategories,
  listMediaEntries,
  listMediaSeasons,
  reorderMediaEntries,
  replaceMediaEntryCover,
  setMediaEntryCoverFromSeason,
  swapMediaCategorySortOrders,
  swapMediaEntrySortOrders,
  updateMediaCategory,
  updateMediaEntry,
  updateMediaEpisode,
  updateMediaSeason,
} from "../domains/media/service.mjs";
import { readMultipartImage } from "../http/multipart-image.mjs";

export function registerMediaRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/media", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listMediaEntries(getSupabaseAdmin(), request.auth.user.uid, request.query || {}),
  }));

  app.get("/api/media-episodes/favorites", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listFavoriteMediaEpisodes(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {},
      ),
    },
  }));

  app.get("/api/media-episodes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaEpisode(getSupabaseAdmin(), request.auth.user.uid, request.params.id),
    },
  }));

  app.put("/api/media-episodes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEpisode(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.get("/api/media-categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listMediaCategories(getSupabaseAdmin(), request.auth.user.uid) },
  }));

  app.get("/api/media-categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaCategory(getSupabaseAdmin(), request.auth.user.uid, request.params.id),
    },
  }));

  app.post("/api/media-categories", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaCategory(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media-categories/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapMediaCategorySortOrders(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/media-categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaCategory(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media-categories/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaCategory(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/media/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaEntry(getSupabaseAdmin(), request.auth.user.uid, request.params.id),
    },
  }));

  app.get("/api/media/:id/seasons", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listMediaSeasons(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      ),
    },
  }));

  app.post("/api/media/:id/seasons", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaSeason(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media/:id/cover", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await setMediaEntryCoverFromSeason(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.post("/api/media/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: {
        item: await replaceMediaEntryCover(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.put("/api/media-seasons/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaSeason(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media-seasons/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaSeason(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.post(
    "/api/media-seasons/:id/episodes",
    { preHandler: authenticated },
    async (request, reply) => {
      const item = await addNextMediaEpisode(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      );
      return reply.code(201).send({ ok: true, data: { item } });
    },
  );

  app.post("/api/media", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaEntry(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderMediaEntries(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/media/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapMediaEntrySortOrders(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/media/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEntry(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaEntry(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

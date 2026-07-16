import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { config, getMissingRuntimeConfig } from "./config.mjs";
import {
  loginWithWechatCode,
  logoutSession,
  requireAuth,
  requireWriteAccess,
} from "./lib/auth.mjs";
import {
  createDish,
  deleteDish,
  getDish,
  listCategories,
  listDishes,
  readMultipartImage,
  reorderDishes,
  replaceDishImage,
  swapDishSortOrders,
  toDishResponse,
  updateDish,
  updatePrintStatus,
} from "./lib/dishes.mjs";
import { HttpError } from "./lib/errors.mjs";
import {
  createActivityItem,
  createDiningPlace,
  createLuggageGroup,
  createLuggageItem,
  createLuggageScene,
  createMediaEntry,
  createMediaSeason,
  createMediaCategory,
  deleteActivityItem,
  deleteDiningPlace,
  deleteLuggageGroup,
  deleteLuggageItem,
  deleteLuggageScene,
  deleteMediaEntry,
  deleteMediaSeason,
  deleteMediaCategory,
  getDiningPlace,
  getMediaEntry,
  getMediaEpisode,
  getMediaCategory,
  listActivityItems,
  listDiningPlaces,
  listLuggageScenes,
  listMediaEntries,
  listMediaSeasons,
  listFavoriteMediaEpisodes,
  listMediaCategories,
  moveLuggageItem,
  moveLuggageGroup,
  reorderMediaEntries,
  setMediaEntryCoverFromSeason,
  swapMediaEntrySortOrders,
  swapMediaCategorySortOrders,
  swapLuggageGroupSortOrders,
  updateActivityItem,
  updateDiningPlace,
  updateLuggageGroup,
  updateLuggageItem,
  updateLuggageScene,
  updateMediaEntry,
  updateMediaEpisode,
  updateMediaSeason,
  addNextMediaEpisode,
  updateMediaCategory,
} from "./lib/life-lists.mjs";
import { getSupabaseAdmin as getDefaultSupabaseAdmin } from "./lib/supabase.mjs";
import { readAvatarImage, updateUserAvatar } from "./lib/user-profile.mjs";
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
} from "./lib/wardrobe.mjs";

export function buildServer(options = {}) {
  const getSupabaseAdmin = () => options.supabase ?? getDefaultSupabaseAdmin();
  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== "test",
    bodyLimit: config.maxUploadSizeMb * 1024 * 1024 + 1024 * 1024,
  });

  app.register(multipart, {
    limits: {
      files: 1,
      fileSize: config.maxUploadSizeMb * 1024 * 1024,
      fields: 10,
    },
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  const authenticated = async (request) => {
    await requireAuth(getSupabaseAdmin(), request);
  };
  const profileCompletionAuthenticated = async (request) => {
    await requireAuth(getSupabaseAdmin(), request, { allowIncompleteProfile: true });
  };
  const writable = async (request) => {
    await requireAuth(getSupabaseAdmin(), request);
    requireWriteAccess(request);
  };

  app.get("/api/health", async () => ({
    ok: true,
    service: "human-draft-server",
    configured: getMissingRuntimeConfig().length === 0,
    missing_config: getMissingRuntimeConfig(),
    uptime: Math.round(process.uptime()),
  }));

  app.post("/api/auth/wechat", async (request) => {
    return {
      ok: true,
      data: await loginWithWechatCode(getSupabaseAdmin(), request.body?.code, {
        displayName: request.body?.display_name,
        avatarUrl: request.body?.avatar_url,
      }),
    };
  });

  app.post("/api/auth/avatar", { preHandler: profileCompletionAuthenticated }, async (request) => {
    const avatar = await readAvatarImage(request);
    const avatarUrl = await updateUserAvatar(
      getSupabaseAdmin(),
      request.auth.user.id,
      avatar,
    );
    return {
      ok: true,
      data: { user: { ...request.auth.user, avatar_url: avatarUrl } },
    };
  });

  app.get("/api/auth/me", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { user: request.auth.user },
  }));

  app.post("/api/auth/logout", { preHandler: profileCompletionAuthenticated }, async (request) => {
    await logoutSession(getSupabaseAdmin(), request);
    return { ok: true };
  });

  app.get("/api/categories", { preHandler: authenticated }, async () => ({
    ok: true,
    data: { items: await listCategories(getSupabaseAdmin()) },
  }));

  app.get("/api/dishes", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listDishes(getSupabaseAdmin(), request.query || {}),
  }));

  app.get("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    const supabase = getSupabaseAdmin();
    return {
      ok: true,
      data: { dish: toDishResponse(supabase, await getDish(supabase, request.params.id)) },
    };
  });

  app.post("/api/dishes", { preHandler: writable }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request);
    const dish = await createDish(getSupabaseAdmin(), fields, image);
    return reply.code(201).send({ ok: true, data: { dish } });
  });

  app.put("/api/dishes/print-status", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await updatePrintStatus(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/dishes/reorder", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await reorderDishes(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/dishes/order/swap", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await swapDishSortOrders(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/dishes/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: { dish: await updateDish(getSupabaseAdmin(), request.params.id, request.body || {}) },
  }));

  app.post("/api/dishes/:id/image", { preHandler: writable }, async (request) => {
    const { image } = await readMultipartImage(request);
    return {
      ok: true,
      data: { dish: await replaceDishImage(getSupabaseAdmin(), request.params.id, image) },
    };
  });

  app.delete("/api/dishes/:id", { preHandler: writable }, async (request) => {
    await deleteDish(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/media", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listMediaEntries(getSupabaseAdmin(), request.query || {}),
  }));

  app.get("/api/media-episodes/favorites", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listFavoriteMediaEpisodes(getSupabaseAdmin(), request.query || {}) },
  }));

  app.get("/api/media-episodes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { item: await getMediaEpisode(getSupabaseAdmin(), request.params.id) },
  }));

  app.put("/api/media-episodes/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEpisode(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.get("/api/media-categories", { preHandler: authenticated }, async () => ({
    ok: true,
    data: { items: await listMediaCategories(getSupabaseAdmin()) },
  }));

  app.get("/api/media-categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { item: await getMediaCategory(getSupabaseAdmin(), request.params.id) },
  }));

  app.post("/api/media-categories", { preHandler: writable }, async (request, reply) => {
    const item = await createMediaCategory(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media-categories/order/swap", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await swapMediaCategorySortOrders(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/media-categories/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: { item: await updateMediaCategory(getSupabaseAdmin(), request.params.id, request.body || {}) },
  }));

  app.delete("/api/media-categories/:id", { preHandler: writable }, async (request) => {
    await deleteMediaCategory(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/media/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { item: await getMediaEntry(getSupabaseAdmin(), request.params.id) },
  }));

  app.get("/api/media/:id/seasons", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listMediaSeasons(getSupabaseAdmin(), request.params.id) },
  }));

  app.post("/api/media/:id/seasons", { preHandler: writable }, async (request, reply) => {
    const item = await createMediaSeason(
      getSupabaseAdmin(),
      request.params.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media/:id/cover", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await setMediaEntryCoverFromSeason(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.put("/api/media-seasons/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaSeason(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media-seasons/:id", { preHandler: writable }, async (request) => {
    await deleteMediaSeason(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.post("/api/media-seasons/:id/episodes", { preHandler: writable }, async (request, reply) => {
    const item = await addNextMediaEpisode(getSupabaseAdmin(), request.params.id);
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.post("/api/media", { preHandler: writable }, async (request, reply) => {
    const item = await createMediaEntry(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media/reorder", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await reorderMediaEntries(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/media/order/swap", { preHandler: writable }, async (request) => ({
    ok: true,
    data: await swapMediaEntrySortOrders(getSupabaseAdmin(), request.body || {}),
  }));

  app.put("/api/media/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEntry(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media/:id", { preHandler: writable }, async (request) => {
    await deleteMediaEntry(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/activities", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listActivityItems(getSupabaseAdmin(), request.query || {}) },
  }));

  app.post("/api/activities", { preHandler: writable }, async (request, reply) => {
    const item = await createActivityItem(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/activities/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateActivityItem(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/activities/:id", { preHandler: writable }, async (request) => {
    await deleteActivityItem(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/luggage", { preHandler: authenticated }, async () => ({
    ok: true,
    data: { items: await listLuggageScenes(getSupabaseAdmin()) },
  }));

  app.post("/api/luggage/scenes", { preHandler: writable }, async (request, reply) => {
    const item = await createLuggageScene(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/scenes/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageScene(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/luggage/scenes/:id", { preHandler: writable }, async (request) => {
    await deleteLuggageScene(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.post("/api/luggage/groups", { preHandler: writable }, async (request, reply) => {
    const item = await createLuggageGroup(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/groups/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageGroup(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/luggage/groups/:id", { preHandler: writable }, async (request) => {
    await deleteLuggageGroup(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.put("/api/luggage/groups/order/swap", { preHandler: writable }, async (request) => {
    await swapLuggageGroupSortOrders(getSupabaseAdmin(), request.body || {});
    return { ok: true, data: { swapped: true } };
  });

  app.put("/api/luggage/groups/order/move", { preHandler: writable }, async (request) => {
    await moveLuggageGroup(getSupabaseAdmin(), request.body || {});
    return { ok: true, data: { moved: true } };
  });

  app.post("/api/luggage/items", { preHandler: writable }, async (request, reply) => {
    const item = await createLuggageItem(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/luggage/items/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateLuggageItem(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.put("/api/luggage/items/:id/move", { preHandler: writable }, async (request) => {
    await moveLuggageItem(
      getSupabaseAdmin(),
      request.params.id,
      request.body || {},
    );
    return { ok: true, data: { moved: true } };
  });

  app.delete("/api/luggage/items/:id", { preHandler: writable }, async (request) => {
    await deleteLuggageItem(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/dining", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listDiningPlaces(getSupabaseAdmin(), request.query || {}) },
  }));

  app.get("/api/dining/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { item: await getDiningPlace(getSupabaseAdmin(), request.params.id) },
  }));

  app.post("/api/dining", { preHandler: writable }, async (request, reply) => {
    const item = await createDiningPlace(getSupabaseAdmin(), request.body || {});
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/dining/:id", { preHandler: writable }, async (request) => ({
    ok: true,
    data: {
      item: await updateDiningPlace(
        getSupabaseAdmin(),
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/dining/:id", { preHandler: writable }, async (request) => {
    await deleteDiningPlace(getSupabaseAdmin(), request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/wardrobe/categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listWardrobeCategories(getSupabaseAdmin(), request.auth.user.id),
    },
  }));

  app.get("/api/wardrobe/stats", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await getWardrobeStats(getSupabaseAdmin(), request.auth.user.id),
  }));

  app.get("/api/wardrobe/categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getWardrobeCategory(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
      ),
    },
  }));

  app.post("/api/wardrobe/categories", { preHandler: authenticated }, async (request, reply) => {
    const item = await createWardrobeCategory(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/wardrobe/categories/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapWardrobeCategorySortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/wardrobe/categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateWardrobeCategory(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/wardrobe/categories/:id", { preHandler: authenticated }, async (request) => {
    await deleteWardrobeCategory(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.params.id,
    );
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/wardrobe/items", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listWardrobeItems(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.query || {},
      ),
    },
  }));

  app.get("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getWardrobeItem(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
      ),
    },
  }));

  app.post("/api/wardrobe/items", { preHandler: authenticated }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request);
    const item = await createWardrobeItem(
      getSupabaseAdmin(),
      request.auth.user.id,
      fields,
      image,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/wardrobe/items/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapWardrobeItemSortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/wardrobe/items/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderWardrobeItems(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateWardrobeItem(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.post("/api/wardrobe/items/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request);
    return {
      ok: true,
      data: {
        item: await replaceWardrobeItemImage(
          getSupabaseAdmin(),
          request.auth.user.id,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.delete("/api/wardrobe/items/:id", { preHandler: authenticated }, async (request) => {
    await deleteWardrobeItem(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.params.id,
    );
    return { ok: true, data: { deleted: true } };
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "Not Found" },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (!(error instanceof HttpError)) {
      request.log.error(error);
    } else if (error.cause) {
      request.log.error(error.cause);
    }

    const statusCode = error instanceof HttpError ? error.statusCode : error.statusCode || 500;
    const code = error instanceof HttpError ? error.code : error.code || "INTERNAL_ERROR";
    const message =
      error instanceof HttpError
        ? error.message
        : statusCode === 413
          ? "上传文件过大。"
          : "服务器暂时无法处理请求。";

    reply.code(statusCode).send({
      ok: false,
      error: {
        code,
        message,
        ...(error instanceof HttpError && error.details ? { details: error.details } : {}),
      },
    });
  });

  return app;
}

async function start() {
  const app = buildServer();
  const shutdown = async (signal) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await app.listen({ host: config.host, port: config.port });
}

const isMainModule =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  start().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

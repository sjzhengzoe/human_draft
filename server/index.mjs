import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { config, getMissingRuntimeConfig } from "./config.mjs";
import {
  loginWithWechatCode,
  logoutSession,
  requireAuth,
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
  createDiningScene,
  createLuggageGroup,
  createLuggageItem,
  createLuggageScene,
  createMediaEntry,
  createMediaSeason,
  createMediaCategory,
  deleteActivityItem,
  deleteDiningPlace,
  deleteDiningScene,
  deleteLuggageGroup,
  deleteLuggageItem,
  deleteLuggageScene,
  deleteMediaEntry,
  deleteMediaSeason,
  deleteMediaCategory,
  getDiningPlace,
  getDiningScene,
  getMediaEntry,
  getMediaEpisode,
  getMediaCategory,
  listActivityItems,
  listDiningPlaces,
  listDiningScenes,
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
  swapActivityItemSortOrders,
  swapLuggageGroupSortOrders,
  updateActivityItem,
  updateDiningPlace,
  updateDiningScene,
  swapDiningSceneSortOrders,
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
import { wechatContentSecurity } from "./lib/wechat-content-security.mjs";
import {
  addExerciseTask,
  claimExerciseMonth,
  completeExerciseTasks,
  consumeExerciseRestDay,
  getExerciseDashboard,
  resetExerciseState,
  saveExerciseSettings,
} from "./lib/exercise.mjs";
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
  const contentSecurity =
    options.contentSecurity ??
    (config.nodeEnv === "test"
      ? { checkText: async () => {}, checkImage: async () => {} }
      : wechatContentSecurity);
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
    await contentSecurity.checkImage(avatar);
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

  app.post("/api/content-security/text", { preHandler: authenticated }, async (request) => {
    await contentSecurity.checkText(
      request.auth.user.openid,
      request.body?.content,
    );
    return { ok: true, data: { safe: true } };
  });

  app.get("/api/exercise", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await getExerciseDashboard(
      getSupabaseAdmin(),
      request.auth.user.id,
    ),
  }));

  app.put("/api/exercise/settings", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await saveExerciseSettings(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.post("/api/exercise/reset", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await resetExerciseState(
      getSupabaseAdmin(),
      request.auth.user.id,
    ),
  }));

  app.post("/api/exercise/monthly-claim", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await claimExerciseMonth(
      getSupabaseAdmin(),
      request.auth.user.id,
    ),
  }));

  app.post("/api/exercise/rest-day", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await consumeExerciseRestDay(
      getSupabaseAdmin(),
      request.auth.user.id,
    ),
  }));

  app.post("/api/exercise/extra-claim", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await addExerciseTask(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.post("/api/exercise/complete", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await completeExerciseTasks(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.get("/api/categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listCategories(getSupabaseAdmin(), request.auth.user.id) },
  }));

  app.get("/api/dishes", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listDishes(getSupabaseAdmin(), request.auth.user.id, request.query || {}),
  }));

  app.get("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    const supabase = getSupabaseAdmin();
    return {
      ok: true,
      data: {
        dish: toDishResponse(
          supabase,
          await getDish(supabase, request.auth.user.id, request.params.id),
        ),
      },
    };
  });

  app.post("/api/dishes", { preHandler: authenticated }, async (request, reply) => {
    const { fields, image } = await readMultipartImage(request);
    await contentSecurity.checkImage(image);
    const dish = await createDish(getSupabaseAdmin(), request.auth.user.id, fields, image);
    return reply.code(201).send({ ok: true, data: { dish } });
  });

  app.put("/api/dishes/print-status", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await updatePrintStatus(getSupabaseAdmin(), request.auth.user.id, request.body || {}),
  }));

  app.put("/api/dishes/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderDishes(getSupabaseAdmin(), request.auth.user.id, request.body || {}),
  }));

  app.put("/api/dishes/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapDishSortOrders(getSupabaseAdmin(), request.auth.user.id, request.body || {}),
  }));

  app.put("/api/dishes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      dish: await updateDish(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.post("/api/dishes/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readMultipartImage(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: {
        dish: await replaceDishImage(
          getSupabaseAdmin(),
          request.auth.user.id,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.delete("/api/dishes/:id", { preHandler: authenticated }, async (request) => {
    await deleteDish(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/media", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listMediaEntries(getSupabaseAdmin(), request.auth.user.id, request.query || {}),
  }));

  app.get("/api/media-episodes/favorites", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listFavoriteMediaEpisodes(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.query || {},
      ),
    },
  }));

  app.get("/api/media-episodes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaEpisode(getSupabaseAdmin(), request.auth.user.id, request.params.id),
    },
  }));

  app.put("/api/media-episodes/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEpisode(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.get("/api/media-categories", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: { items: await listMediaCategories(getSupabaseAdmin(), request.auth.user.id) },
  }));

  app.get("/api/media-categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaCategory(getSupabaseAdmin(), request.auth.user.id, request.params.id),
    },
  }));

  app.post("/api/media-categories", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaCategory(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media-categories/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapMediaCategorySortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/media-categories/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaCategory(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media-categories/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaCategory(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.get("/api/media/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await getMediaEntry(getSupabaseAdmin(), request.auth.user.id, request.params.id),
    },
  }));

  app.get("/api/media/:id/seasons", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listMediaSeasons(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
      ),
    },
  }));

  app.post("/api/media/:id/seasons", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaSeason(
      getSupabaseAdmin(),
      request.auth.user.id,
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
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.put("/api/media-seasons/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaSeason(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media-seasons/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaSeason(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

  app.post("/api/media-seasons/:id/episodes", { preHandler: authenticated }, async (request, reply) => {
    const item = await addNextMediaEpisode(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.params.id,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.post("/api/media", { preHandler: authenticated }, async (request, reply) => {
    const item = await createMediaEntry(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/media/reorder", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await reorderMediaEntries(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/media/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapMediaEntrySortOrders(
      getSupabaseAdmin(),
      request.auth.user.id,
      request.body || {},
    ),
  }));

  app.put("/api/media/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateMediaEntry(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
      ),
    },
  }));

  app.delete("/api/media/:id", { preHandler: authenticated }, async (request) => {
    await deleteMediaEntry(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });

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
  app.post("/api/dining-scenes", { preHandler: authenticated }, async (request, reply) => reply.code(201).send({
    ok: true,
    data: {
      item: await createDiningScene(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.body || {},
      ),
    },
  }));
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
    await contentSecurity.checkImage(image);
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
    await contentSecurity.checkImage(image);
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

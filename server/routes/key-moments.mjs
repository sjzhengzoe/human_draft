import {
  createKeyMoment,
  createKeyMomentDraft,
  deleteKeyMoment,
  discardNewKeyMomentImages,
  discardStagedKeyMomentImages,
  listKeyMomentContext,
  listKeyMomentFeed,
  listKeyMoments,
  readKeyMoment,
  readKeyMomentMultipart,
  stageNewKeyMomentImage,
  stageKeyMomentImage,
  updateKeyMoment,
} from "../domains/key-moments/service.mjs";

export function registerKeyMomentRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/key-moments", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listKeyMoments(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.query || {},
    ),
  }));

  app.get("/api/key-moments/feed", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listKeyMomentFeed(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.query || {},
    ),
  }));

  app.get("/api/key-moments/:id/context", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listKeyMomentContext(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
      request.query || {},
    ),
  }));

  app.get("/api/key-moments/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await readKeyMoment(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      ),
    },
  }));

  app.post("/api/key-moments/drafts", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await createKeyMomentDraft(getSupabaseAdmin(), request.auth.user.uid),
  }));

  app.post("/api/key-moments/drafts/:id/images", { preHandler: authenticated }, async (request) => {
    const { image } = await readKeyMomentMultipart(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: await stageNewKeyMomentImage(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        image,
      ),
    };
  });

  app.delete("/api/key-moments/drafts/:id/images", { preHandler: authenticated }, async (request) => {
    await discardNewKeyMomentImages(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
      request.body || {},
    );
    return { ok: true, data: { discarded: true } };
  });

  app.post("/api/key-moments", { preHandler: authenticated }, async (request, reply) => {
    const fields = request.body || {};
    if (fields.content) {
      await contentSecurity.checkText(request.auth.user.openid, fields.content);
    }
    const item = await createKeyMoment(
      getSupabaseAdmin(),
      request.auth.user.uid,
      fields,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/key-moments/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateKeyMoment(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
        {
          checkText: (content) =>
            contentSecurity.checkText(request.auth.user.openid, content),
        },
      ),
    },
  }));

  app.post("/api/key-moments/:id/images/stage", { preHandler: authenticated }, async (request) => {
    const { fields, image } = await readKeyMomentMultipart(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: await stageKeyMomentImage(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        image,
        fields,
      ),
    };
  });

  app.delete("/api/key-moments/:id/images/staged", { preHandler: authenticated }, async (request) => {
    await discardStagedKeyMomentImages(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
      request.body || {},
    );
    return { ok: true, data: { discarded: true } };
  });

  app.delete("/api/key-moments/:id", { preHandler: authenticated }, async (request) => {
    await deleteKeyMoment(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

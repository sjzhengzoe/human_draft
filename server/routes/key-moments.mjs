import {
  createKeyMoment,
  deleteKeyMoment,
  deleteKeyMomentImage,
  listKeyMoments,
  readKeyMomentMultipart,
  replaceKeyMomentImage,
  updateKeyMoment,
} from "../domains/key-moments/service.mjs";

export function registerKeyMomentRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/key-moments", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listKeyMoments(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.query || {},
      ),
    },
  }));

  app.post("/api/key-moments", { preHandler: authenticated }, async (request, reply) => {
    let fields = request.body || {};
    let image;
    if (request.isMultipart()) {
      ({ fields, image } = await readKeyMomentMultipart(request));
    }
    if (fields.content) {
      await contentSecurity.checkText(request.auth.user.openid, fields.content);
    }
    if (image) await contentSecurity.checkImage(image);
    const item = await createKeyMoment(
      getSupabaseAdmin(),
      request.auth.user.id,
      fields,
      image,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/key-moments/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateKeyMoment(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
        request.body || {},
        {
          checkText: (content) =>
            contentSecurity.checkText(request.auth.user.openid, content),
        },
      ),
    },
  }));

  app.post("/api/key-moments/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readKeyMomentMultipart(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: {
        item: await replaceKeyMomentImage(
          getSupabaseAdmin(),
          request.auth.user.id,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.delete("/api/key-moments/:id/image", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await deleteKeyMomentImage(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.params.id,
      ),
    },
  }));

  app.delete("/api/key-moments/:id", { preHandler: authenticated }, async (request) => {
    await deleteKeyMoment(getSupabaseAdmin(), request.auth.user.id, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

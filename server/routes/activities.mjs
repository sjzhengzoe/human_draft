import {
  createActivityItem,
  deleteActivityItem,
  listActivityItems,
  readActivityMultipart,
  replaceActivityItemImage,
  swapActivityItemSortOrders,
  updateActivityItem,
} from "../domains/activities/service.mjs";
import { checkUserText } from "../domains/shared/content-security.mjs";

export function registerActivityRoutes(app, context) {
  const { authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/activities", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      items: await listActivityItems(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {},
      ),
    },
  }));

  app.post("/api/activities", { preHandler: authenticated }, async (request, reply) => {
    let fields = request.body || {};
    let image;
    if (request.isMultipart()) {
      ({ fields, image } = await readActivityMultipart(request));
    }
    await Promise.all([
      checkUserText(contentSecurity, request.auth.user.openid, fields.name, fields.introduction),
      image ? contentSecurity.checkImage(image) : undefined,
    ]);
    const item = await createActivityItem(
      getSupabaseAdmin(),
      request.auth.user.uid,
      fields,
      image,
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.put("/api/activities/order/swap", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await swapActivityItemSortOrders(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    ),
  }));

  app.put("/api/activities/:id", { preHandler: authenticated }, async (request) => {
    await checkUserText(
      contentSecurity,
      request.auth.user.openid,
      request.body?.name,
      request.body?.introduction,
    );
    return {
      ok: true,
      data: {
        item: await updateActivityItem(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
        request.body || {},
      ),
      },
    };
  });

  app.post("/api/activities/:id/image", { preHandler: authenticated }, async (request) => {
    const { image } = await readActivityMultipart(request);
    await contentSecurity.checkImage(image);
    return {
      ok: true,
      data: {
        item: await replaceActivityItemImage(
          getSupabaseAdmin(),
          request.auth.user.uid,
          request.params.id,
          image,
        ),
      },
    };
  });

  app.delete("/api/activities/:id", { preHandler: authenticated }, async (request) => {
    await deleteActivityItem(getSupabaseAdmin(), request.auth.user.uid, request.params.id);
    return { ok: true, data: { deleted: true } };
  });
}

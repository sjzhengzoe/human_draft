import {
  addOfficialChatTopic,
  createOfficialChatTopic,
  createUserChatTopic,
  deleteOfficialChatTopic,
  deleteUserChatTopic,
  hideOfficialChatTopic,
  listChatTopics,
  listHiddenOfficialChatTopics,
  listPublicOfficialChatTopics,
  restoreOfficialChatTopic,
  updateOfficialChatTopic,
  updateUserChatTopic,
} from "../domains/chat-topics/service.mjs";

export function registerChatTopicRoutes(app, context) {
  const { adminAuthenticated, authenticated, contentSecurity, getSupabaseAdmin } = context;

  app.get("/api/chat-topics/official", async (request) => ({
    ok: true,
    data: await listPublicOfficialChatTopics(
      getSupabaseAdmin(),
      request.query || {},
    ),
  }));

  app.get("/api/chat-topics", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await listChatTopics(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.query || {},
    ),
  }));

  app.get(
    "/api/chat-topics/official/hidden",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await listHiddenOfficialChatTopics(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.query || {},
      ),
    }),
  );

  app.post(
    "/api/chat-topics/official",
    { preHandler: adminAuthenticated },
    async (request, reply) => {
      const content = request.body?.content;
      if (typeof content === "string" && content.trim()) {
        await contentSecurity.checkText(request.auth.user.openid, content.trim());
      }
      const item = await createOfficialChatTopic(getSupabaseAdmin(), request.body || {});
      return reply.code(201).send({ ok: true, data: { item } });
    },
  );

  app.put(
    "/api/chat-topics/official/:id",
    { preHandler: adminAuthenticated },
    async (request) => ({
      ok: true,
      data: {
        item: await updateOfficialChatTopic(
          getSupabaseAdmin(),
          request.params.id,
          request.body || {},
          {
            checkText: (content) =>
              contentSecurity.checkText(request.auth.user.openid, content),
          },
        ),
      },
    }),
  );

  app.delete(
    "/api/chat-topics/official/:id",
    { preHandler: adminAuthenticated },
    async (request) => {
      await deleteOfficialChatTopic(getSupabaseAdmin(), request.params.id);
      return { ok: true, data: { deleted: true } };
    },
  );

  app.post(
    "/api/chat-topics/official/:id/dislike",
    { preHandler: authenticated },
    async (request) => {
      await hideOfficialChatTopic(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      );
      return { ok: true, data: { hidden: true } };
    },
  );

  app.delete(
    "/api/chat-topics/official/:id/hide",
    { preHandler: authenticated },
    async (request) => {
      await restoreOfficialChatTopic(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.params.id,
      );
      return { ok: true, data: { restored: true } };
    },
  );

  app.post("/api/chat-topics/mine", { preHandler: authenticated }, async (request, reply) => {
    const content = request.body?.content;
    if (typeof content === "string" && content.trim()) {
      await contentSecurity.checkText(request.auth.user.openid, content.trim());
    }
    const item = await createUserChatTopic(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.body || {},
    );
    return reply.code(201).send({ ok: true, data: { item } });
  });

  app.post(
    "/api/chat-topics/mine/from-official",
    { preHandler: authenticated },
    async (request, reply) => {
      const result = await addOfficialChatTopic(
        getSupabaseAdmin(),
        request.auth.user.uid,
        request.body?.official_topic_id,
      );
      return reply.code(result.created ? 201 : 200).send({ ok: true, data: result });
    },
  );

  app.put("/api/chat-topics/mine/:id", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: {
      item: await updateUserChatTopic(
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

  app.delete("/api/chat-topics/mine/:id", { preHandler: authenticated }, async (request) => {
    await deleteUserChatTopic(
      getSupabaseAdmin(),
      request.auth.user.uid,
      request.params.id,
    );
    return { ok: true, data: { deleted: true } };
  });
}

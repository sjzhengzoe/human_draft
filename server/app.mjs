import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { config } from "./config.mjs";
import { createAuthGuards } from "./http/auth-guards.mjs";
import { registerErrorHandlers } from "./http/error-handlers.mjs";
import { getSupabaseAdmin as getDefaultSupabaseAdmin } from "./lib/supabase.mjs";
import { wechatContentSecurity } from "./lib/wechat-content-security.mjs";
import { registerActivityRoutes } from "./routes/activities.mjs";
import { registerAuthRoutes } from "./routes/auth.mjs";
import { registerChatTopicRoutes } from "./routes/chat-topics.mjs";
import { registerContentSecurityRoutes } from "./routes/content-security.mjs";
import { registerDiningRoutes } from "./routes/dining.mjs";
import { registerExerciseRoutes } from "./routes/exercise.mjs";
import { registerFootprintRoutes } from "./routes/footprint.mjs";
import { registerKeyMomentRoutes } from "./routes/key-moments.mjs";
import { registerLuggageRoutes } from "./routes/luggage.mjs";
import { registerMediaRoutes } from "./routes/media.mjs";
import { registerMenuRoutes } from "./routes/menu.mjs";
import { registerSystemRoutes } from "./routes/system.mjs";
import { registerWardrobeRoutes } from "./routes/wardrobe.mjs";

const routeRegistrars = [
  registerSystemRoutes,
  registerAuthRoutes,
  registerContentSecurityRoutes,
  registerExerciseRoutes,
  registerFootprintRoutes,
  registerMenuRoutes,
  registerMediaRoutes,
  registerActivityRoutes,
  registerLuggageRoutes,
  registerDiningRoutes,
  registerKeyMomentRoutes,
  registerChatTopicRoutes,
  registerWardrobeRoutes,
];

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
      fields: 16,
    },
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
    }
    return payload;
  });

  const authGuards = createAuthGuards(getSupabaseAdmin);
  const routeContext = {
    ...authGuards,
    contentSecurity,
    getSupabaseAdmin,
  };

  for (const registerRoutes of routeRegistrars) {
    registerRoutes(app, routeContext);
  }
  registerErrorHandlers(app);

  return app;
}

import { config } from "../config.mjs";
import {
  createNoopProductAnalytics,
  createProductAnalytics,
  resolveContentCreationModule,
} from "../domains/system/product-analytics.mjs";

export function registerProductAnalytics(app, options, getSupabaseAdmin) {
  const productAnalytics = options.productAnalytics ?? (
    config.nodeEnv === "test"
      ? createNoopProductAnalytics()
      : createProductAnalytics(getSupabaseAdmin, { logger: app.log })
  );
  app.addHook("onResponse", async (request, reply) => {
    const module = resolveContentCreationModule(request, reply.statusCode);
    if (module) await productAnalytics.recordContentCreation({ request, module });
  });
  return productAnalytics;
}

import { config } from "../config.mjs";
import {
  createRuntimeControlService,
  createStaticRuntimeControlService,
} from "../domains/system/runtime-controls.mjs";
import { HttpError } from "../lib/errors.mjs";
import {
  createNoopOperationalEventRecorder,
  createOperationalEventRecorder,
} from "./operational-events.mjs";
import { createRequestRateLimiter } from "./rate-limiter.mjs";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function registerRuntimeSafety(app, options, getSupabaseAdmin) {
  const rateLimiter = options.rateLimiter ?? createRequestRateLimiter({
    enabled: config.nodeEnv !== "test",
  });
  app.addHook("onRequest", async (request, reply) => {
    rateLimiter.enforceIp(request, reply);
  });

  const runtimeControls = options.runtimeControls ?? (
    config.nodeEnv === "test"
      ? createStaticRuntimeControlService()
      : createRuntimeControlService(getSupabaseAdmin)
  );
  app.addHook("preHandler", async (request) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    if (request.routeOptions.config?.allowDuringReadOnly === true) return;
    const controls = await runtimeControls.getSnapshot();
    const writeControl = controls.write_enabled;
    if (!writeControl.enabled) {
      throw new HttpError(
        503,
        "SYSTEM_READ_ONLY",
        writeControl.message || "系统正在维护，当前暂时只能查看已有内容。",
      );
    }
  });

  const operationalEvents = options.operationalEvents ?? (
    config.nodeEnv === "test"
      ? createNoopOperationalEventRecorder()
      : createOperationalEventRecorder(getSupabaseAdmin)
  );
  return { operationalEvents, rateLimiter, runtimeControls };
}

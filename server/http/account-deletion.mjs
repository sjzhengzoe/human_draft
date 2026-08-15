import { config } from "../config.mjs";
import { createAccountDeletionService } from "../domains/auth/account-deletion.mjs";

export function registerAccountDeletion(app, options, getSupabaseAdmin) {
  const service = options.accountDeletion ?? createAccountDeletionService({
    getSupabaseAdmin,
    logger: app.log,
  });
  if (config.nodeEnv === "test") return service;

  let cleanupTimer;
  app.addHook("onReady", async () => {
    await service.processPendingJobs().catch((error) => {
      app.log.error(error, "account image cleanup startup failed");
    });
    cleanupTimer = setInterval(() => {
      void service.processPendingJobs().catch((error) => {
        app.log.error(error, "account image cleanup interval failed");
      });
    }, 15 * 60 * 1000);
    cleanupTimer.unref();
  });
  app.addHook("onClose", async () => {
    if (cleanupTimer) clearInterval(cleanupTimer);
  });
  return service;
}

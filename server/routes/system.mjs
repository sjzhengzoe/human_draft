import { getMissingRuntimeConfig } from "../config.mjs"

export function registerSystemRoutes(app) {
  app.get("/api/health", async () => ({
    ok: true,
    service: "human-draft-server",
    configured: getMissingRuntimeConfig().length === 0,
    missing_config: getMissingRuntimeConfig(),
    uptime: Math.round(process.uptime())
  }))
}

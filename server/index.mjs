import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildServer } from "./app.mjs";
import { config } from "./config.mjs";

export { buildServer } from "./app.mjs";

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

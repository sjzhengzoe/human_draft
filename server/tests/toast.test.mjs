import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native toast calls default to three seconds across the mini program", async () => {
  const [app, toast] = await Promise.all([
    readFile(new URL("../../src/app.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/services/toast.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /initializeToastDefaults\(\)/);
  assert.match(toast, /DEFAULT_TOAST_DURATION = 3000/);
  assert.match(toast, /duration: options\.duration \?\? DEFAULT_TOAST_DURATION/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("icon-only controls are documented as accessible shared components", async () => {
  const [guidance, documentation] = await Promise.all([
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../../docs/ui-icons.md", import.meta.url), "utf8"),
  ]);

  assert.match(guidance, /Follow `docs\/ui-icons\.md`/);
  assert.match(guidance, /icon-only controls without duplicate visible text/);
  assert.match(guidance, /accurate `aria-label`/);
  assert.match(documentation, /优先使用纯图标/);
  assert.match(documentation, /必须提供准确的 `aria-label`/);
  assert.match(documentation, /不得小于 `56rpx × 56rpx`/);
  assert.match(documentation, /全局 `app-icon`/);
});

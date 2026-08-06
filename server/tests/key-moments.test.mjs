import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { periodBounds } from "../domains/key-moments/service.mjs";

test("key moment period bounds use Asia/Shanghai calendar boundaries", () => {
  assert.deepEqual(periodBounds({ granularity: "day", date: "2026-08-02" }), {
    start: "2026-08-01T16:00:00.000Z",
    end: "2026-08-02T16:00:00.000Z",
  });
  assert.deepEqual(periodBounds({ granularity: "month", date: "2026-12-20" }), {
    start: "2026-11-30T16:00:00.000Z",
    end: "2026-12-31T16:00:00.000Z",
  });
  assert.deepEqual(periodBounds({ granularity: "year", date: "2026-02-01" }), {
    start: "2025-12-31T16:00:00.000Z",
    end: "2026-12-31T16:00:00.000Z",
  });
});

test("key moment period bounds reject invalid dates", () => {
  assert.throws(
    () => periodBounds({ granularity: "day", date: "2026-02-30" }),
    (error) => error?.code === "INVALID_DATE",
  );
  assert.throws(
    () => periodBounds({ granularity: "week", date: "2026-08-02" }),
    (error) => error?.code === "INVALID_GRANULARITY",
  );
});

test("key moment creation uses the previewed date only for day view", async () => {
  const page = await readFile(
    new URL("../../src/pages/key-moments/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /const editorDate = this\.data\.activeGranularity === "day"[\s\S]*?\? this\.data\.anchorDate[\s\S]*?: now\.date/,
  );
  assert.match(page, /editorDate,[\s\S]*?editorTime: now\.time/);
});

test("key moment timeline items own the edit hit area without a corner control", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
  ]);
  assert.match(
    page,
    /class="timeline-entry[^\n]*"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?bindtap="handleEdit"/,
  );
  assert.match(page, /class="moment-image"[\s\S]*?catchtap="handlePreview"/);
  assert.doesNotMatch(page, /edit-button|edit-button__dots|•••/);
  assert.doesNotMatch(styles, /\.edit-button/);
});

test("key moments migration creates user-owned records and a private image bucket", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608020001_key_moments.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(migration, /alter table public\.key_moments enable row level security/i);
  assert.match(migration, /'key-moment-images',[\s\S]*?false,/i);
  assert.match(migration, /key_moments_user_occurred_idx/i);
});

test("key moment content limit migration preserves old rows and enforces 50 characters", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608020002_key_moment_content_limit.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /char_length\(content\) <= 50/i);
  assert.match(migration, /not valid/i);
});

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

test("key moment items own the edit hit area and isolate the corner delete control", async () => {
  const [page, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(
    page,
    /class="timeline-entry[^\n]*"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?bindtap="handleEdit"/,
  );
  assert.match(page, /class="moment-image"[\s\S]*?catchtap="handlePreview"/);
  assert.match(
    page,
    /class="timeline-delete-button"[\s\S]*?data-id="\{\{item\.id\}\}"[\s\S]*?catchtap="handleDelete"/,
  );
  assert.doesNotMatch(page, /class="delete-button"|edit-button|edit-button__dots|•••/);
  assert.match(styles, /\.timeline-delete-button/);
  assert.doesNotMatch(styles, /\.delete-button|\.edit-button/);
  assert.match(
    logic,
    /handleDelete\(event:[\s\S]*?editingId: id,[\s\S]*?showDeleteConfirm: true/,
  );
  assert.match(
    logic,
    /handleDeleteConfirmCancel\(\)[\s\S]*?showDeleteConfirm: false, editingId: ""/,
  );
});

test("key moments offer user-scoped horizontal and vertical display settings", async () => {
  const [page, styles, logic, settingsPage, settingsLogic, storage, appConfig] = await Promise.all([
    readFile(new URL("../../src/pages/key-moments/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/key-moments/settings/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/key-moment-settings.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);

  assert.match(
    page,
    /class="settings-button"[\s\S]*?aria-label="人生节点设置"[\s\S]*?<app-icon name="settings-2"/,
  );
  assert.doesNotMatch(page, /<text>设置<\/text>/);
  assert.match(
    page,
    /class="add-button"[\s\S]*?aria-label="新增人生节点"[\s\S]*?<app-icon name="plus-white"/,
  );
  assert.match(page, /moment-card--\{\{displayLayout\}\}/);
  assert.match(page, /shape="rectangle"[\s\S]*?aspect-ratio="\{\{imageCropAspectRatio\}\}"/);
  assert.match(styles, /\.moment-image\s*\{[\s\S]*?width: 236rpx;[\s\S]*?aspect-ratio: 4 \/ 3;/);
  assert.match(styles, /\.moment-card--vertical\s*\{[\s\S]*?display: block;/);
  assert.match(styles, /\.moment-card--vertical \.moment-image\s*\{[\s\S]*?width: 100%;/);
  assert.match(logic, /getKeyMomentDisplayLayout\(session\.user\.id\)/);
  assert.match(logic, /wx\.navigateTo\(\{ url: "\/pages\/key-moments\/settings\/index" \}\)/);
  assert.match(settingsPage, /默认图文布局/);
  assert.match(settingsPage, /layout-preview--\{\{item\.value\}\}/);
  assert.match(settingsLogic, /setKeyMomentDisplayLayout\(this\.data\.userId, layout\)/);
  assert.match(storage, /KEY_MOMENT_DISPLAY_LAYOUT_V1/);
  assert.match(storage, /storageKey\(userId\)/);
  assert.match(appConfig, /"pages\/key-moments\/settings\/index"/);
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

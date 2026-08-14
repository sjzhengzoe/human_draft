import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(
  new URL("../scripts/optimize-storage-images.mjs", import.meta.url),
  "utf8",
);
const singleImageMigration = await readFile(
  new URL("../../supabase/migrations/20260814051334_single_image_storage.sql", import.meta.url),
  "utf8",
);
const thumbnailCleanup = await readFile(
  new URL("../scripts/cleanup-storage-thumbnails.mjs", import.meta.url),
  "utf8",
);

test("historical image migration covers every database-backed image module", () => {
  for (const table of [
    "dishes",
    "menu_places",
    "menu_schedule_items",
    "activity_items",
    "media_entries",
    "media_seasons",
    "wardrobe_items",
    "key_moments",
  ]) {
    assert.match(script, new RegExp(`table: "${table}"`));
  }
});

test("historical image migration is dry-run by default and retains old objects", () => {
  assert.match(script, /const applyChanges = process\.argv\.includes\("--apply"\)/);
  assert.match(script, /oldFilesRetained: true/);
  assert.match(script, /migrationDeletesFiles: false/);
  assert.doesNotMatch(script, /\.remove\(/);
  assert.doesNotMatch(script, /upsert: true/);
});

test("historical image migration keeps a private manifest and conditional rollback", () => {
  assert.match(script, /mode: 0o700/);
  assert.match(script, /mode: 0o600/);
  assert.match(script, /--rollback=/);
  assert.match(script, /--resume=/);
  assert.match(script, /rolling_back/);
  assert.match(script, /addConditions\(query, expectedValues\)/);
  assert.match(script, /recordMatches\(supabase, plan, plan\.newValues\)/);
});

test("single-image migration clears legacy thumbnail references without deleting data", () => {
  for (const table of [
    "dishes",
    "menu_places",
    "activity_items",
    "wardrobe_items",
    "key_moments",
  ]) {
    assert.match(
      singleImageMigration,
      new RegExp(`update public\\.${table}[\\s\\S]*?set thumbnail_path = null`, "i"),
    );
  }
  assert.doesNotMatch(singleImageMigration, /delete\s+from|drop\s+table|drop\s+column/i);
});

test("thumbnail cleanup is dry-run by default and preserves recoverable originals", () => {
  assert.match(thumbnailCleanup, /process\.argv\.includes\("--apply"\)/);
  assert.match(thumbnailCleanup, /originalsRetained: true/);
  assert.match(thumbnailCleanup, /derivativesRecoverableFromOriginals: true/);
  assert.match(thumbnailCleanup, /仍有数据库记录引用候选缩略图/);
  assert.match(thumbnailCleanup, /sha256/);
  assert.match(thumbnailCleanup, /mode: 0o600/);
});

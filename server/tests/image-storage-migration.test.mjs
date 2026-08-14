import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const script = await readFile(
  new URL("../scripts/optimize-storage-images.mjs", import.meta.url),
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
  assert.match(script, /rolling_back/);
  assert.match(script, /addConditions\(query, expectedValues\)/);
});

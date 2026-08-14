import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cleanupMigration = await readFile(
  new URL("../../supabase/migrations/20260814105241_cleanup_prelaunch_redundancy.sql", import.meta.url),
  "utf8",
);
const mediaCoverRecovery = await readFile(
  new URL("../scripts/restore-missing-media-covers.mjs", import.meta.url),
  "utf8",
);

test("pre-launch cleanup removes legacy thumbnail columns after the single-image cutover", () => {
  for (const table of [
    "dishes",
    "menu_places",
    "activity_items",
    "wardrobe_items",
    "key_moments",
  ]) {
    assert.match(
      cleanupMigration,
      new RegExp(`alter table public\\.${table} drop column if exists thumbnail_path`, "i"),
    );
  }
});

test("media cover recovery is dry-run by default and only fills missing COS objects", () => {
  assert.match(mediaCoverRecovery, /process\.argv\.includes\("--apply"\)/);
  assert.match(mediaCoverRecovery, /!existingKeys\.has\(cosObjectKey/);
  assert.match(mediaCoverRecovery, /status = "skipped-existing"/);
  assert.match(mediaCoverRecovery, /uploaded\.equals\(optimized\.buffer\)/);
  assert.match(mediaCoverRecovery, /originalsRetained: apply/);
  assert.match(mediaCoverRecovery, /--source-manifest=/);
  assert.match(mediaCoverRecovery, /sourceBackupReused/);
  assert.match(mediaCoverRecovery, /readFile\(sourceFilePath\)/);
  assert.match(mediaCoverRecovery, /bangumi\.tv/);
  assert.match(mediaCoverRecovery, /lain\.bgm\.tv/);
  assert.match(mediaCoverRecovery, /\.doubanio\.com/);
  assert.match(mediaCoverRecovery, /mode: 0o600/);
  assert.doesNotMatch(mediaCoverRecovery, /deleteCosObject|\.remove\(/);
});

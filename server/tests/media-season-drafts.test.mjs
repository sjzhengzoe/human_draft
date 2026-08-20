import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260820115709_fix_media_episode_reordering.sql",
  import.meta.url,
);

test("media season draft saving stages episode numbers before reordering", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.save_media_season_drafts/i);
  assert.match(
    migration,
    /delete from public\.media_episodes[\s\S]*?set episode_number = episode_number \+ 1000000[\s\S]*?set episode_number = episode_position/i,
  );
  assert.match(migration, /where season_id = saved_season_id and uid = p_uid/i);
  assert.match(
    migration,
    /revoke all on function public\.save_media_season_drafts[\s\S]*?grant execute[\s\S]*?to service_role/i,
  );
});

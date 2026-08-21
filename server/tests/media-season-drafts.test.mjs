import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260821080450_preserve_media_episode_titles_in_season_drafts.sql",
  import.meta.url,
);

test("media season draft saving preserves titles and stages episode numbers before reordering", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /create or replace function public\.save_media_season_drafts/i);
  assert.match(
    migration,
    /delete from public\.media_episodes[\s\S]*?set episode_number = episode_number \+ 1000000[\s\S]*?set episode_number = episode_position/i,
  );
  assert.match(migration, /where season_id = saved_season_id and uid = p_uid/i);
  assert.match(migration, /draft_episode_title := btrim[\s\S]*?title = draft_episode_title/i);
  assert.match(migration, /uid, season_id, episode_number, title, plot_summary, is_favorite/i);
  assert.match(
    migration,
    /revoke all on function public\.save_media_season_drafts[\s\S]*?grant execute[\s\S]*?to service_role/i,
  );
});

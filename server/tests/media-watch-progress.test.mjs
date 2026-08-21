import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260821065220_media_watch_progress.sql",
  import.meta.url,
);

test("media watch progress stores one user-scoped episode and validates its owning entry", async () => {
  const migration = await readFile(migrationUrl, "utf8");

  assert.match(migration, /add column if not exists last_watched_episode_id uuid/i);
  assert.match(migration, /unique \(id, uid\)/i);
  assert.match(
    migration,
    /foreign key \(last_watched_episode_id, uid\)[\s\S]*?references public\.media_episodes\(id, uid\)[\s\S]*?on delete set null \(last_watched_episode_id\)/i,
  );
  assert.match(migration, /create index if not exists media_entries_last_watched_episode_idx/i);
  assert.match(migration, /create or replace function public\.set_media_watch_progress/i);
  assert.match(migration, /current_watch_status <> 'in_progress'/i);
  assert.match(
    migration,
    /season\.media_entry_id = p_media_entry_id[\s\S]*?set last_watched_episode_id = p_episode_id/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.set_media_watch_progress[\s\S]*?grant execute[\s\S]*?to service_role/i,
  );
  assert.doesNotMatch(migration, /update public\.media_entries[\s\S]*?where watch_status = 'in_progress'/i);
  assert.doesNotMatch(migration, /delete from public\.media_/i);
});

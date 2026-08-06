import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/202607280002_all_modules_user_isolation.sql",
  import.meta.url,
);

test("all personal modules are migrated to user-owned rows", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  const tables = [
    "categories",
    "dishes",
    "media_categories",
    "media_entries",
    "media_seasons",
    "media_episodes",
    "activity_items",
    "luggage_scenes",
    "luggage_groups",
    "luggage_items",
    "dining_scenes",
    "dining_places",
  ];

  for (const table of tables) {
    assert.match(
      migration,
      new RegExp(`alter table public\\.${table} alter column user_id set not null`, "i"),
      `${table} must require user ownership`,
    );
    assert.match(
      migration,
      new RegExp(`${table}_user_id_fkey[\\s\\S]*?references public\\.app_users`, "i"),
      `${table} must cascade from its owner account`,
    );
  }

  assert.match(migration, /wechat_openid = 'oCaBp3b0npjUNGOt9wD2lw5c5vZQ'/);
  assert.match(migration, /create or replace function public\.ensure_user_defaults\(p_user_id uuid\)/i);
  assert.match(migration, /create or replace function public\.reorder_dishes\(p_user_id uuid/i);
  assert.match(migration, /create or replace function public\.move_luggage_item\(\s*p_user_id uuid/i);
  assert.match(migration, /create or replace function public\.search_favorite_media_episodes\(\s*p_user_id uuid/i);
});

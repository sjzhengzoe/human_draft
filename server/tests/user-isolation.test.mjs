import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const migrationUrl = new URL(
  "../../supabase/migrations/202607280002_all_modules_user_isolation.sql",
  import.meta.url,
);
const uidMigrationUrl = new URL(
  "../../supabase/migrations/20260814160545_user_uid_identity.sql",
  import.meta.url,
);

const userOwnedTables = new Set([
  "activity_items",
  "categories",
  "dining_scenes",
  "dishes",
  "exercise_completion_events",
  "exercise_daily_goal_changes",
  "exercise_daily_rest_days",
  "exercise_profiles",
  "exercise_rest_credit_events",
  "key_moments",
  "luggage_groups",
  "luggage_items",
  "luggage_scenes",
  "media_categories",
  "media_entries",
  "media_episodes",
  "media_seasons",
  "menu_favorites",
  "menu_places",
  "menu_schedule_items",
  "menu_schedule_meals",
  "user_chat_topics",
  "user_footprint_cities",
  "user_footprint_city_places",
  "user_hidden_official_chat_topics",
  "wardrobe_categories",
  "wardrobe_items",
]);

async function readSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return readSourceFiles(path);
    if (!entry.isFile() || !entry.name.endsWith(".mjs")) return [];
    return [{ path, source: await readFile(path, "utf8") }];
  }));
  return files.flat();
}

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

test("public UID migration reserves special accounts and generates increasing ten-digit IDs", async () => {
  const migration = await readFile(uidMigrationUrl, "utf8");

  assert.match(migration, /set uid = '10000'[\s\S]*where display_name = '顾飞飞'/i);
  assert.match(migration, /set uid = '20000'[\s\S]*where display_name <> '顾飞飞'/i);
  assert.match(migration, /1000000000::bigint[\s\S]*nextval\([^)]*app_user_uid_sequence[^)]*\) \* 100[\s\S]*floor\(random\(\) \* 100\)/i);
  assert.match(migration, /check \(uid in \('10000', '20000'\) or uid ~ '\^\[1-9\]\[0-9\]\{9\}\$'\)/i);
  assert.match(migration, /rename column user_id to uid/i);
  assert.match(migration, /REFERENCES public\.app_users\(uid\)/i);
  assert.match(migration, /delete from public\.app_sessions/i);
  assert.match(migration, /left business rows referencing the internal app_users id/i);
});

test("every business API route requires an authenticated session", async () => {
  const routeFiles = await readSourceFiles(join(projectRoot, "server/routes"));
  const publicRoutes = new Set([
    "GET /api/health",
    "GET /api/chat-topics/official",
    "POST /api/auth/wechat",
  ]);
  let routeCount = 0;

  for (const { path, source } of routeFiles) {
    const compactSource = source.replace(/\s+/g, " ");
    const routePattern = /app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi;
    for (const match of compactSource.matchAll(routePattern)) {
      routeCount += 1;
      const route = `${match[1].toUpperCase()} ${match[2]}`;
      if (publicRoutes.has(route)) continue;
      const declaration = compactSource.slice(match.index, match.index + 360);
      assert.match(
        declaration,
        /preHandler:\s*(?:authenticated|adminAuthenticated|profileCompletionAuthenticated|refreshAuthenticated)/,
        `${route} in ${path} must require authentication`,
      );
    }
  }

  assert.ok(routeCount >= 80, "the route audit should cover the complete business API");
});

test("service-role table access always carries authenticated user ownership", async () => {
  const domainFiles = await readSourceFiles(join(projectRoot, "server/domains"));
  let checkedQueries = 0;

  for (const { path, source } of domainFiles) {
    const queryPattern = /\.from\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of source.matchAll(queryPattern)) {
      if (!userOwnedTables.has(match[1])) continue;
      checkedQueries += 1;
      const statementStart = Math.max(
        source.lastIndexOf(";", match.index) + 1,
        source.lastIndexOf("\n\n", match.index) + 2,
      );
      const statementEnd = source.indexOf(";", match.index);
      const statement = source.slice(
        statementStart,
        statementEnd === -1 ? match.index + 800 : statementEnd + 1,
      );
      assert.match(
        statement,
        /(?:\.eq\(\s*["']uid["']\s*,\s*uid\s*\)|uid\s*:\s*uid)/,
        `${match[1]} access in ${path} must be scoped to uid`,
      );
    }
  }

  assert.ok(checkedQueries >= 100, "the ownership audit should cover all personal queries");
});

test("all personal RPC calls receive the authenticated user id", async () => {
  const domainFiles = await readSourceFiles(join(projectRoot, "server/domains"));
  let checkedCalls = 0;

  for (const { path, source } of domainFiles) {
    const rpcPattern = /\.rpc\(\s*["']([^"']+)["']/g;
    for (const match of source.matchAll(rpcPattern)) {
      checkedCalls += 1;
      const call = source.slice(match.index, match.index + 1200);
      assert.match(
        call,
        /p_uid\s*:\s*(?:uid|user\.uid)/,
        `${match[1]} in ${path} must receive the authenticated user id`,
      );
    }
  }

  assert.ok(checkedCalls >= 30, "the RPC audit should cover all personal database functions");
});

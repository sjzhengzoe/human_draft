import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-that-is-at-least-32-bytes";
const { buildServer } = await import("../index.mjs");
const { issueAccessToken } = await import("../domains/auth/access-token.mjs");
const {
  getUserHomeModuleSettings,
  normalizeHiddenHomeModuleKeys,
  saveUserHomeModuleSettings,
} = await import("../domains/auth/home-module-settings.mjs");

const UID = "1000000001";
const OTHER_UID = "1000000002";
const TEST_TOKEN = (await issueAccessToken({
  sessionId: "10000000-0000-4000-8000-000000000001",
  user: { uid: UID, wechat_openid: "test-openid" },
})).token;

function createSettingsSupabase(rows = []) {
  const calls = [];

  class Query {
    constructor() {
      this.rows = rows;
      this.selectedRows = rows;
    }

    select() {
      return this;
    }

    eq(field, value) {
      calls.push({ operation: "eq", field, value });
      this.selectedRows = this.selectedRows.filter((row) => row[field] === value);
      return this;
    }

    upsert(value, options) {
      calls.push({ operation: "upsert", value, options });
      const index = rows.findIndex((row) => row.uid === value.uid);
      if (index >= 0) rows[index] = { ...rows[index], ...value };
      else rows.push({ ...value });
      this.selectedRows = [rows[index >= 0 ? index : rows.length - 1]];
      return this;
    }

    async maybeSingle() {
      return { data: this.selectedRows[0] || null, error: null };
    }

    async single() {
      return { data: this.selectedRows[0] || null, error: null };
    }
  }

  return {
    calls,
    from(table) {
      assert.equal(table, "user_home_module_settings");
      return new Query();
    },
  };
}

test("home module settings are scoped to the authenticated UID", async () => {
  const rows = [
    { uid: UID, hidden_module_keys: ["media", "luggage"] },
    { uid: OTHER_UID, hidden_module_keys: ["menu"] },
  ];
  const supabase = createSettingsSupabase(rows);

  assert.deepEqual(await getUserHomeModuleSettings(supabase, UID), {
    configured: true,
    hidden_module_keys: ["media", "luggage"],
  });

  const saved = await saveUserHomeModuleSettings(supabase, UID, ["footprint", "menu"]);
  assert.deepEqual(saved, {
    configured: true,
    hidden_module_keys: ["menu", "footprint"],
  });
  assert.deepEqual(rows.find((row) => row.uid === OTHER_UID)?.hidden_module_keys, ["menu"]);
  assert.equal(
    supabase.calls.some((call) => call.operation === "upsert" && call.value.uid === UID),
    true,
  );
});

test("home module settings reject unknown, duplicate, and all-hidden values", () => {
  assert.throws(
    () => normalizeHiddenHomeModuleKeys(["unknown"]),
    (error) => error?.statusCode === 400 && error?.code === "INVALID_HOME_MODULE_SETTINGS",
  );
  assert.throws(
    () => normalizeHiddenHomeModuleKeys(["menu", "menu"]),
    (error) => error?.statusCode === 400 && error?.code === "INVALID_HOME_MODULE_SETTINGS",
  );
  assert.throws(
    () => normalizeHiddenHomeModuleKeys([
      "menu",
      "media",
      "activities",
      "chat-topics",
      "text-card",
      "exercise",
      "luggage",
      "wardrobe",
      "key-moments",
      "footprint",
    ]),
    (error) => error?.statusCode === 400 && error?.code === "HOME_MODULE_REQUIRED",
  );
});

test("home module settings API requires login and persists the current user's values", async (t) => {
  const rows = [];
  const app = buildServer({ logger: false, supabase: createSettingsSupabase(rows) });
  t.after(() => app.close());

  const unauthorized = await app.inject({
    method: "PUT",
    url: "/api/auth/home-modules",
    payload: { hidden_module_keys: ["media"] },
  });
  assert.equal(unauthorized.statusCode, 401);

  const initial = await app.inject({
    method: "GET",
    url: "/api/auth/home-modules",
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
  });
  assert.equal(initial.statusCode, 200);
  assert.deepEqual(initial.json().data, { configured: false, hidden_module_keys: [] });

  const saved = await app.inject({
    method: "PUT",
    url: "/api/auth/home-modules",
    headers: { authorization: `Bearer ${TEST_TOKEN}` },
    payload: { hidden_module_keys: ["footprint", "media"] },
  });
  assert.equal(saved.statusCode, 200);
  assert.deepEqual(saved.json().data, {
    configured: true,
    hidden_module_keys: ["media", "footprint"],
  });
  assert.deepEqual(rows, [{ uid: UID, hidden_module_keys: ["media", "footprint"] }]);
});

test("home module settings migration keeps the table private and user-owned", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/20260815015627_user_home_module_settings.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.user_home_module_settings/i);
  assert.match(migration, /uid text primary key[\s\S]*?references public\.app_users\(uid\) on delete cascade/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges[\s\S]*?from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert, update, delete[\s\S]*?to service_role/i);
  assert.match(migration, /hidden_module_keys <@ array/i);
  assert.match(migration, /cardinality\(hidden_module_keys\) < 10/i);
});

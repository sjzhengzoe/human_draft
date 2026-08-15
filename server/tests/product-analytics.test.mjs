import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";

const {
  createProductAnalytics,
  resolveContentCreationModule,
  sanitizeProductAttribution,
} = await import("../domains/system/product-analytics.mjs");

const projectRoot = new URL("../../", import.meta.url);

test("product analytics migration is service-only and has no arbitrary private payload", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20260815052714_product_analytics.sql", projectRoot),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.product_events/i);
  assert.match(migration, /alter table public\.product_events enable row level security/i);
  assert.match(
    migration,
    /revoke all on table public\.product_events from public, anon, authenticated/i,
  );
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /Asia\/Shanghai/);
  assert.match(migration, /registration_completed/);
  assert.match(migration, /image_uploaded/);
  assert.doesNotMatch(migration, /\b(?:details|properties)\s+jsonb|ip_address|request_body/i);
});

test("attribution accepts fixed operational dimensions and drops private or malformed values", () => {
  assert.deepEqual(sanitizeProductAttribution({
    source_scene: "1001",
    source_campaign: "beta_test-1",
    source_referrer_app_id: "wx1234567890abcdef",
    release_channel: "trial",
    private_text: "不应保留",
  }), {
    source_scene: 1001,
    source_campaign: "beta_test-1",
    source_referrer_app_id: "wx1234567890abcdef",
    release_channel: "trial",
  });
  assert.deepEqual(sanitizeProductAttribution({
    source_scene: -1,
    source_campaign: "包含 空格",
    source_referrer_app_id: "https://example.test",
    release_channel: "unknown",
  }), {
    source_scene: null,
    source_campaign: null,
    source_referrer_app_id: null,
    release_channel: null,
  });
});

function createWriteSupabase() {
  const writes = [];
  const cleanupCalls = [];
  return {
    writes,
    cleanupCalls,
    from(table) {
      assert.equal(table, "product_events");
      return {
        upsert(value, options) {
          writes.push({ value, options });
          return Promise.resolve({ data: null, error: null });
        },
        delete() { return this; },
        neq() { return this; },
        lt(field, value) {
          cleanupCalls.push({ field, value });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
}

test("registration, login, and module events use stable dedupe keys without private content", async () => {
  const supabase = createWriteSupabase();
  const fixedNow = new Date("2026-08-15T05:30:00.000Z");
  const analytics = createProductAnalytics(() => supabase, { now: () => fixedNow });
  await analytics.recordAuthentication({
    request: { id: "request-login-1" },
    uid: "10000",
    isNewUser: true,
    attribution: { source_scene: 1001, private_text: "绝不能记录" },
  });
  const request = { id: "request-module-1", auth: { user: { uid: "10000" } } };
  await analytics.recordModuleOpen({
    request,
    module: "menu",
    attribution: { source_campaign: "public_beta", private_image: "secret" },
  });
  await analytics.recordModuleOpen({
    request,
    module: "menu",
    attribution: { source_campaign: "public_beta" },
  });
  await analytics.recordClientContentCreation({ request, module: "text_card" });

  assert.equal(supabase.writes.length, 5);
  assert.equal(supabase.writes[0].value.event_key, "registration:10000");
  assert.equal(supabase.writes[1].value.event_key, "login:request-login-1");
  assert.equal(supabase.writes[2].value.event_key, supabase.writes[3].value.event_key);
  assert.equal(supabase.writes[2].options.ignoreDuplicates, true);
  assert.match(supabase.writes[4].value.event_key, /^client-content:10000:text_card:/);
  assert.equal(supabase.writes[4].value.ingestion_source, "client");
  assert.doesNotMatch(JSON.stringify(supabase.writes), /绝不能记录|private_text|private_image|secret/);
  assert.equal(supabase.cleanupCalls.length, 1);
});

test("only successful core business creation routes become trusted creation events", () => {
  const request = {
    id: "request-create-1",
    method: "POST",
    routeOptions: { url: "/api/dishes" },
    auth: { user: { uid: "10000" } },
  };
  assert.equal(resolveContentCreationModule(request, 201), "menu");
  assert.equal(resolveContentCreationModule(request, 500), null);
  assert.equal(resolveContentCreationModule({ ...request, auth: undefined }, 201), null);
  assert.equal(resolveContentCreationModule({
    ...request,
    method: "PUT",
    routeOptions: { url: "/api/footprint/cities/:cityCode" },
    body: { visited: false },
  }, 200), null);
});

class ReadQuery {
  constructor(rows) { this.rows = rows; }
  select() { return this; }
  gte() { return this; }
  lte() { return this; }
  order() { return this; }
  single() { return Promise.resolve({ data: this.rows[0] || null, error: null }); }
  then(resolve, reject) {
    return Promise.resolve({ data: this.rows, error: null }).then(resolve, reject);
  }
}

test("admin analytics fills missing Shanghai days and returns cost summaries", async () => {
  const tables = {
    product_daily_overview: [{
      metric_date: "2026-08-14",
      registrations: 1,
      logins: 2,
      active_users: 1,
      module_opens: 3,
      content_creations: 1,
      image_uploads: 1,
      uploaded_bytes: 2048,
      error_occurrences: 0,
      warning_occurrences: 1,
    }],
    product_module_daily: [{
      metric_date: "2026-08-14",
      module: "menu",
      unique_users: 1,
      module_opens: 3,
      content_creations: 1,
      image_uploads: 1,
      uploaded_bytes: 2048,
    }],
    product_source_daily: [],
    product_current_summary: [{
      total_users: 2,
      users_logged_in_30d: 2,
      image_count: 477,
      current_image_bytes: 64799110,
      open_error_groups: 0,
    }],
  };
  const analytics = createProductAnalytics(
    () => ({ from: (table) => new ReadQuery(tables[table] || []) }),
    { now: () => new Date("2026-08-15T06:00:00.000Z") },
  );
  const dashboard = await analytics.getAdminDashboard({ days: 3 });
  assert.deepEqual(dashboard.range, { from: "2026-08-13", to: "2026-08-15", days: 3 });
  assert.equal(dashboard.daily.length, 3);
  assert.equal(dashboard.daily[0].module_opens, 0);
  assert.equal(dashboard.daily[1].module_opens, 3);
  assert.equal(dashboard.totals.uploaded_bytes, 2048);
  assert.equal(dashboard.current.current_image_bytes, 64799110);
  assert.equal(dashboard.modules[0].module, "menu");
});

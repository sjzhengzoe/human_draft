import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.ADMIN_UIDS = "10000";
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-that-is-at-least-32-bytes";

const { buildServer } = await import("../index.mjs");
const { issueAccessToken } = await import("../domains/auth/access-token.mjs");
const {
  DEFAULT_IMAGE_STORAGE_QUOTA_BYTES,
  DEFAULT_IMAGE_STORAGE_WARNING_BYTES,
  uploadStorageImage,
} = await import("../domains/shared/image-storage.mjs");
const {
  createStaticRuntimeControlService,
} = await import("../domains/system/runtime-controls.mjs");
const { FixedWindowRateLimiter } = await import("../http/rate-limiter.mjs");
const { createOperationalEventRecorder } = await import("../http/operational-events.mjs");
const { setCosStorageTestAdapter } = await import("../lib/cos-storage.mjs");

const projectRoot = new URL("../../", import.meta.url);

test("runtime safety migration keeps all operational tables service-only", async () => {
  const migration = await readFile(
    new URL("supabase/migrations/20260815032516_runtime_safety_controls.sql", projectRoot),
    "utf8",
  );
  for (const table of [
    "runtime_controls",
    "runtime_control_audits",
    "image_storage_limits",
    "operational_events",
  ]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, "i"),
    );
  }
  assert.match(migration, /104857600/);
  assert.match(migration, /83886080/);
  assert.match(migration, /get_user_image_storage_usage\(p_uid text\)/i);
  assert.match(migration, /update_runtime_control/i);
  assert.match(migration, /record_operational_event/i);
  assert.doesNotMatch(migration, /notification|email|webhook/i);
});

test("fixed-window limiter rejects excess calls and reports a retry delay", () => {
  const limiter = new FixedWindowRateLimiter();
  assert.equal(limiter.consume("login:one", { limit: 2, windowMs: 1_000 }, 0).allowed, true);
  assert.equal(limiter.consume("login:one", { limit: 2, windowMs: 1_000 }, 100).allowed, true);
  const rejected = limiter.consume("login:one", { limit: 2, windowMs: 1_000 }, 200);
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterSeconds, 1);
  assert.equal(limiter.consume("login:one", { limit: 2, windowMs: 1_000 }, 1_001).allowed, true);
});

function createQuotaSupabase({ usedBytes, oldAsset } = {}) {
  const assetRows = oldAsset ? [oldAsset] : [];
  const writes = [];
  return {
    writes,
    rpc(name) {
      assert.equal(name, "get_user_image_storage_usage");
      return Promise.resolve({
        data: [{
          module: "menu",
          image_count: assetRows.length,
          used_bytes: usedBytes,
          quota_bytes: DEFAULT_IMAGE_STORAGE_QUOTA_BYTES,
          warning_bytes: DEFAULT_IMAGE_STORAGE_WARNING_BYTES,
        }],
        error: null,
      });
    },
    from(table) {
      assert.equal(table, "image_assets");
      const query = {
        rows: [...assetRows],
        select() { return this; },
        eq(field, value) {
          this.rows = this.rows.filter((row) => row[field] === value);
          return this;
        },
        in(field, values) {
          this.rows = this.rows.filter((row) => values.includes(row[field]));
          return this;
        },
        upsert(value) {
          writes.push(value);
          return Promise.resolve({ data: value, error: null });
        },
        then(resolve, reject) {
          return Promise.resolve({ data: this.rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("image uploads stop at 100 MB but replacements receive credit for the old object", async () => {
  const cosWrites = [];
  setCosStorageTestAdapter({
    async putObject(input) { cosWrites.push(input); },
    async deleteObject() {},
  });

  const full = createQuotaSupabase({ usedBytes: DEFAULT_IMAGE_STORAGE_QUOTA_BYTES });
  await assert.rejects(
    uploadStorageImage(full, {
      bucketName: "dish-images",
      path: "users/10000/new.webp",
      uid: "10000",
      buffer: Buffer.alloc(1),
      contentType: "image/webp",
      cacheControl: "3600",
    }),
    (error) => error?.code === "IMAGE_STORAGE_QUOTA_EXCEEDED" && error?.statusCode === 409,
  );
  assert.equal(cosWrites.length, 0);

  const oldPath = "users/10000/old.webp";
  const replacement = createQuotaSupabase({
    usedBytes: DEFAULT_IMAGE_STORAGE_QUOTA_BYTES,
    oldAsset: {
      object_key: `dish-images/${oldPath}`,
      uid: "10000",
      size_bytes: 10,
    },
  });
  await uploadStorageImage(replacement, {
    bucketName: "dish-images",
    path: "users/10000/replacement.webp",
    uid: "10000",
    buffer: Buffer.alloc(9),
    contentType: "image/webp",
    cacheControl: "3600",
    replacedPaths: [oldPath],
  });
  assert.equal(cosWrites.length, 1);
  assert.equal(replacement.writes.length, 1);
});

test("emergency read-only blocks business writes while keeping safe endpoints available", async (t) => {
  const runtimeControls = createStaticRuntimeControlService({
    write_enabled: { enabled: false, message: "维护中，只能查看。" },
  });
  const app = buildServer({ logger: false, runtimeControls, supabase: {} });
  t.after(() => app.close());

  const health = await app.inject({ method: "GET", url: "/api/health" });
  assert.equal(health.statusCode, 200);

  const businessWrite = await app.inject({
    method: "POST",
    url: "/api/activities",
    payload: {},
  });
  assert.equal(businessWrite.statusCode, 503);
  assert.equal(businessWrite.json().error.code, "SYSTEM_READ_ONLY");

  const safePost = await app.inject({
    method: "POST",
    url: "/api/content-security/text",
    payload: { content: "本地文字" },
  });
  assert.equal(safePost.statusCode, 401);

  const adminToken = (await issueAccessToken({
    sessionId: "10000000-0000-4000-8000-000000000001",
    user: { uid: "10000", wechat_openid: "admin-openid" },
  })).token;
  const recovery = await app.inject({
    method: "PUT",
    url: "/api/admin/runtime-controls/write_enabled",
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { enabled: true, reason: "故障已经排除" },
  });
  assert.equal(recovery.statusCode, 200);
  assert.equal((await runtimeControls.getSnapshot()).write_enabled.enabled, true);
});

test("database operational events omit request bodies and raw error messages", async () => {
  const calls = [];
  const recorder = createOperationalEventRecorder(() => ({
    rpc(name, params) {
      calls.push({ name, params });
      return Promise.resolve({ data: name === "record_operational_event" ? "event-id" : 0, error: null });
    },
  }));
  const error = new Error("不应写入数据库的私人内容");
  error.cause = new Error("同样不应写入的底层内容");
  await recorder.record({
    request: {
      id: "request-1",
      method: "POST",
      url: "/api/example?secret=query",
      routeOptions: { url: "/api/example" },
      body: { private_text: "绝不能记录" },
      auth: { user: { uid: "10000" } },
    },
    error,
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "服务器暂时无法处理请求。",
  });
  const record = calls.find((call) => call.name === "record_operational_event");
  assert.ok(record);
  const serialized = JSON.stringify(record.params);
  assert.doesNotMatch(serialized, /绝不能记录|私人内容|底层内容|secret=query/);
  assert.equal(record.params.p_route, "/api/example");
  assert.equal(record.params.p_uid, "10000");
});

test("recorded server errors expose a request id and call the database recorder", async (t) => {
  const records = [];
  const app = buildServer({
    logger: false,
    operationalEvents: {
      async record(event) { records.push(event); },
    },
  });
  app.get("/api/test-operational-error", async () => {
    throw new Error("test failure");
  });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/api/test-operational-error" });
  const body = response.json();
  assert.equal(response.statusCode, 500);
  assert.equal(body.error.request_id, response.headers["x-request-id"]);
  assert.equal(records.length, 1);
  assert.equal(records[0].request.id, body.error.request_id);
});

test("admin runtime page uses the shared bottom dialog and exposes audited controls", async () => {
  const [markup, logic, settingsMarkup] = await Promise.all([
    readFile(new URL("src/pages/settings/runtime-controls/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/settings/runtime-controls/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/settings/index.wxml", projectRoot), "utf8"),
  ]);
  assert.match(markup, /<app-dialog[\s\S]*placement="bottom"/);
  assert.match(markup, /dialog-mode="\{\{true\}\}"/);
  assert.match(markup, /最近操作/);
  assert.match(logic, /updateRuntimeControl/);
  assert.match(settingsMarkup, /wx:if="\{\{isAdmin\}\}"[\s\S]*运营控制/);
});

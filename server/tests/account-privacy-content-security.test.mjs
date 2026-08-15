import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WECHAT_APP_ID = "test-app-id";
process.env.WECHAT_APP_SECRET = "test-app-secret";
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-that-is-at-least-32-bytes";

const { collectUserText, checkUserText } = await import(
  "../domains/shared/content-security.mjs"
);
const { createAccountDeletionService } = await import(
  "../domains/auth/account-deletion.mjs"
);

test("content safety flattens multipart JSON and nested user-authored text", async () => {
  const values = collectUserText(
    "  菜名  ",
    '["番茄", "鸡蛋"]',
    [{ content: "剧情记录", dialogues: [{ speaker: "甲", content: "对白" }] }],
    "菜名",
    null,
  );
  assert.deepEqual(values, ["菜名", "番茄", "鸡蛋", "剧情记录", "甲", "对白"]);

  const calls = [];
  await checkUserText(
    { async checkText(openId, content) { calls.push({ openId, content }); } },
    "openid-safe",
    values,
  );
  assert.deepEqual(calls, [{
    openId: "openid-safe",
    content: "菜名\n番茄\n鸡蛋\n剧情记录\n甲\n对白",
  }]);
});

function createDeletionSupabase({ cleanupFails = false } = {}) {
  const state = { rpcCalls: [], jobDeletes: [], jobUpdates: [] };
  return {
    state,
    from(table) {
      if (table === "image_assets") {
        return {
          select() { return this; },
          eq() { return this; },
          async range() {
            return { data: [{ object_key: "dish-images/users/1000000001/a.webp" }], error: null };
          },
        };
      }
      if (table === "account_deletion_jobs") {
        return {
          delete() { this.operation = "delete"; return this; },
          update(values) { this.operation = "update"; this.values = values; return this; },
          async eq(_column, id) {
            if (this.operation === "delete") state.jobDeletes.push(id);
            if (this.operation === "update") state.jobUpdates.push({ id, ...this.values });
            return { data: null, error: cleanupFails ? { code: "TEST" } : null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name, values) {
      assert.equal(name, "delete_app_account");
      state.rpcCalls.push(values);
      return { data: [{ deleted: true, cleanup_pending: true }], error: null };
    },
  };
}

test("account deletion verifies identity, captures ledger and stray COS objects, then clears the job", async () => {
  const supabase = createDeletionSupabase();
  const verification = [];
  const deletedBatches = [];
  const service = createAccountDeletionService({
    getSupabaseAdmin: () => supabase,
    verifyIdentity: async (...args) => verification.push(args),
    listObjects: async (prefix) => prefix.startsWith("dish-images/")
      ? [{ Key: "dish-images/users/1000000001/stray.webp" }]
      : [],
    deleteObjects: async (keys) => {
      deletedBatches.push(keys);
      return { deletedKeys: keys, failedKeys: [] };
    },
    logger: { error() {} },
  });

  const result = await service.deleteAccount({
    uid: "1000000001",
    openId: "openid-owner",
    code: "fresh-code",
  });

  assert.deepEqual(verification, [["fresh-code", "openid-owner"]]);
  assert.equal(supabase.state.rpcCalls.length, 1);
  assert.deepEqual(
    new Set(supabase.state.rpcCalls[0].p_object_keys),
    new Set([
      "dish-images/users/1000000001/a.webp",
      "dish-images/users/1000000001/stray.webp",
    ]),
  );
  assert.deepEqual(deletedBatches[0], supabase.state.rpcCalls[0].p_object_keys);
  assert.equal(supabase.state.jobDeletes.length, 1);
  assert.deepEqual(result, { deleted: true, cleanup_pending: false });
});

test("account deletion succeeds after database removal while failed COS keys remain retryable", async () => {
  const supabase = createDeletionSupabase();
  const service = createAccountDeletionService({
    getSupabaseAdmin: () => supabase,
    verifyIdentity: async () => {},
    listObjects: async () => [],
    deleteObjects: async (keys) => ({ deletedKeys: [], failedKeys: keys }),
    logger: { error() {} },
  });
  const result = await service.deleteAccount({
    uid: "1000000001",
    openId: "openid-owner",
    code: "fresh-code",
  });
  assert.deepEqual(result, { deleted: true, cleanup_pending: true });
  assert.equal(supabase.state.jobDeletes.length, 0);
  assert.equal(supabase.state.jobUpdates.length, 1);
  assert.equal(supabase.state.jobUpdates[0].status, "retrying");
  assert.equal(supabase.state.jobUpdates[0].attempt_count, 1);
  assert.deepEqual(supabase.state.jobUpdates[0].object_keys, [
    "dish-images/users/1000000001/a.webp",
  ]);
});

test("all user-authored business text routes call the shared safety helper", async () => {
  const expectations = new Map([
    ["activities.mjs", ["name", "introduction"]],
    ["dining.mjs", ["name"]],
    ["luggage.mjs", ["name"]],
    ["wardrobe.mjs", ["name", "fields", "values"]],
    ["media.mjs", ["title", "plot_summary", "timeline_notes", "media_type", "name"]],
    ["menu.mjs", ["name", "main_ingredients", "introduction", "flavor_options"]],
    ["admin.mjs", ["reason"]],
  ]);
  for (const [route, fields] of expectations) {
    const source = await readFile(new URL(`../routes/${route}`, import.meta.url), "utf8");
    assert.match(source, /checkUserText/);
    fields.forEach((field) => assert.match(source, new RegExp(`\\.${field}\\b`)));
  }
});

test("account deletion migration is service-only and removes account data atomically", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260815061434_account_deletion.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.account_deletion_jobs/i);
  assert.match(migration, /alter table public\.account_deletion_jobs enable row level security/i);
  assert.match(migration, /revoke all on table public\.account_deletion_jobs from public, anon, authenticated/i);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /delete from public\.product_events where uid = p_uid/i);
  assert.match(migration, /delete from public\.app_users[\s\S]*where uid = p_uid/i);
  assert.match(migration, /revoke all on function public\.delete_app_account[\s\S]*authenticated/i);
  assert.match(migration, /grant execute on function public\.delete_app_account[\s\S]*service_role/i);
});

test("public beta access migration separates cohort, access tier and registration source", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/20260815071848_public_beta_access_profile.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /registration_cohort text not null default 'public_beta'/i);
  assert.match(migration, /access_tier text not null default 'beta_full'/i);
  assert.match(migration, /access_tier in \('beta_full', 'free', 'member'\)/i);
  assert.match(migration, /registration_source_scene integer/i);
  assert.match(migration, /registration_source_campaign text/i);
  assert.match(migration, /registration_referrer_app_id text/i);
  assert.match(migration, /registration_release_channel text/i);
  assert.doesNotMatch(migration, /create table|membership_orders|add column[^;]*(?:payment|balance)/i);
});

test("settings exposes public-beta terms, privacy details, and shared-dialog account deletion", async () => {
  const [appSource, settingsMarkup, settingsLogic, settingsConfig, aboutMarkup, aboutStyles] =
    await Promise.all([
      readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.json", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/about/index.wxml", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/about/index.less", import.meta.url), "utf8"),
    ]);
  assert.ok(JSON.parse(appSource).pages.includes("pages/settings/about/index"));
  assert.equal(JSON.parse(settingsConfig).usingComponents["app-dialog"], "/components/app-dialog/index");
  assert.match(settingsMarkup, /公开测试期 · 当前免费/);
  assert.match(settingsMarkup, /当前不提供会员、充值或付费入口/);
  assert.match(settingsMarkup, /关于、隐私与服务说明/);
  assert.match(settingsMarkup, /<app-dialog[\s\S]*?永久注销/);
  assert.doesNotMatch(settingsLogic.match(/handleDeleteAccountTap[\s\S]*?handleDeleteAccountConfirm/)?.[0] || "", /wx\.showModal/);
  assert.match(settingsLogic, /deleteCurrentAccount\(\)/);
  assert.match(aboutMarkup, /当前服务安排/);
  assert.match(aboutMarkup, /当前不提供会员、充值、余额、订单或付费权益入口/);
  assert.match(aboutMarkup, /不会发生自动扣费/);
  assert.match(aboutMarkup, /不保存你的私人正文、图片内容、完整请求参数或 IP 地址/);
  assert.match(aboutMarkup, /数据库删除立即生效/);
  assert.doesNotMatch(aboutStyles, /#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i);
  assert.deepEqual(
    [...aboutStyles.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]),
    [
      "var(--ui-font-size-small)",
      "var(--ui-font-size-large)",
      "var(--ui-font-size-base)",
      "var(--ui-font-size-small)",
    ],
  );
});

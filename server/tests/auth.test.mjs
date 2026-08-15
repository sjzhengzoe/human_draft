import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WECHAT_APP_ID = "test-app-id";
process.env.WECHAT_APP_SECRET = "test-app-secret";
process.env.ACCESS_TOKEN_SECRET = "test-access-token-secret-that-is-at-least-32-bytes";

const { loginWithWechatCode, requireAuth } = await import("../domains/auth/service.mjs");
const { updateUserAvatar, updateUserDisplayName } = await import("../domains/auth/profile.mjs");
const { setCosStorageTestAdapter } = await import("../lib/cos-storage.mjs");

class FakeQuery {
  constructor(state, table) {
    this.state = state;
    this.table = table;
    this.operation = "select";
    this.values = undefined;
    this.filters = [];
  }

  select() {
    return this;
  }

  insert(values) {
    this.operation = "insert";
    this.values = values;
    return this;
  }

  update(values) {
    this.operation = "update";
    this.values = values;
    return this;
  }

  upsert(values) {
    this.operation = "upsert";
    this.values = values;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value, "eq"]);
    return this;
  }

  in(column, values) {
    this.filters.push([column, values, "in"]);
    return this;
  }

  gt(column, value) {
    this.filters.push([column, value, "gt"]);
    return this;
  }

  matches(row) {
    return this.filters.every(([column, value, operator]) =>
      operator === "gt"
        ? row[column] > value
        : operator === "in"
          ? value.includes(row[column])
          : row[column] === value,
    );
  }

  async execute() {
    if (this.table === "app_sessions" && this.operation === "insert") {
      const session = {
        id: `session-${this.state.sessions.length + 1}`,
        ...this.values,
      };
      this.state.sessions.push(session);
      return { data: session, error: null };
    }

    if (this.table === "app_sessions") {
      const session = this.state.sessions.find((candidate) => this.matches(candidate));
      return { data: session || null, error: null };
    }

    if (this.table === "image_assets") {
      if (this.operation === "upsert") this.state.assetWrites.push({ ...this.values });
      if (this.operation === "delete") this.state.assetDeletes.push([...this.filters]);
      return { data: this.values || null, error: null };
    }

    if (this.table !== "app_users") {
      throw new Error(`Unexpected fake table: ${this.table}`);
    }

    if (this.operation === "insert") {
      const user = {
        id: `internal-user-${this.state.users.length + 1}`,
        uid: String(1_000_000_001 + this.state.users.length),
        created_at: "2026-07-11T00:00:00.000Z",
        ...this.values,
      };
      this.state.users.push(user);
      return { data: user, error: null };
    }

    const user = this.state.users.find((candidate) => this.matches(candidate));
    if (this.operation === "update") {
      if (!user) return { data: null, error: null };
      this.state.userUpdates.push({ ...this.values });
      Object.assign(user, this.values);
    }
    return { data: user || null, error: null };
  }

  maybeSingle() {
    return this.execute();
  }

  single() {
    return this.execute();
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

function createFakeSupabase(users = []) {
  const state = {
    users: users.map((user) => ({ ...user })),
    sessions: [],
    userUpdates: [],
    uploads: [],
    removals: [],
    assetWrites: [],
    assetDeletes: [],
  };

  const splitObjectKey = (key) => {
    const separator = key.indexOf("/");
    return { bucket: key.slice(0, separator), path: key.slice(separator + 1) };
  };
  setCosStorageTestAdapter({
    async putObject({ key, buffer, contentType, cacheControl }) {
      const { bucket, path } = splitObjectKey(key);
      state.uploads.push({
        bucket,
        path,
        contents: buffer,
        options: { contentType, cacheControl },
      });
      return {};
    },
    async deleteObject(key) {
      const { bucket, path } = splitObjectKey(key);
      state.removals.push({ bucket, paths: [path] });
      return {};
    },
    async getSignedObjectUrl(key, expiresIn) {
      const { bucket, path } = splitObjectKey(key);
      return `https://assets.example/${bucket}/${path}?expires=${expiresIn}`;
    },
  });

  return {
    state,
    from(table) {
      return new FakeQuery(state, table);
    },
    async rpc(name) {
      if (name === "get_user_image_storage_usage") {
        return {
          data: [
            {
              module: "avatars",
              image_count: state.assetWrites.length,
              used_bytes: state.assetWrites.reduce(
                (total, asset) => total + Number(asset.size_bytes || 0),
                0,
              ),
              quota_bytes: 104857600,
              warning_bytes: 83886080,
            },
          ],
          error: null,
        };
      }
      assert.equal(name, "ensure_user_defaults");
      return { data: null, error: null };
    },
  };
}

function mockWechatLogin(context, openId) {
  context.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    async json() {
      return { openid: openId };
    },
  }));
}

test("local-avatar signup stays incomplete and can log in again without profile", async (context) => {
  mockWechatLogin(context, "openid-local-avatar");
  const supabase = createFakeSupabase();

  await loginWithWechatCode(supabase, "first-code", {
    displayName: "测试用户",
    avatarUrl: "",
  });

  assert.equal(supabase.state.users[0].profile_completed, false);
  assert.equal(supabase.state.sessions.length, 1);

  const session = await loginWithWechatCode(supabase, "second-code");
  assert.equal(session.user.display_name, "测试用户");
  assert.equal(supabase.state.sessions.length, 2);
});

test("new registrations keep beta cohort separate from access and capture sanitized attribution", async (context) => {
  mockWechatLogin(context, "openid-beta-attribution");
  const supabase = createFakeSupabase();

  const session = await loginWithWechatCode(supabase, "registration-code", {}, {
    registrationAttribution: {
      source_scene: 1001,
      source_campaign: "natural_search",
      source_referrer_app_id: "wx_referrer_01",
      release_channel: "trial",
    },
  });

  assert.equal(supabase.state.users[0].registration_cohort, "public_beta");
  assert.equal(supabase.state.users[0].access_tier, "beta_full");
  assert.equal(supabase.state.users[0].registration_source_scene, 1001);
  assert.equal(supabase.state.users[0].registration_source_campaign, "natural_search");
  assert.equal(supabase.state.users[0].registration_referrer_app_id, "wx_referrer_01");
  assert.equal(supabase.state.users[0].registration_release_channel, "trial");
  assert.deepEqual(session.user.access, {
    registration_cohort: "public_beta",
    service_stage: "public_beta",
    display_label: "公测体验中",
    billing_visible: false,
    paid_features_visible: false,
  });
});

test("a migrated completed user can still log in without an avatar", async (context) => {
  mockWechatLogin(context, "openid-existing");
  const supabase = createFakeSupabase([
    {
      id: "internal-existing-user",
      uid: "1000000001",
      wechat_openid: "openid-existing",
      display_name: "旧用户",
      avatar_url: "",
      profile_completed: true,
      created_at: "2026-07-10T00:00:00.000Z",
    },
  ]);

  const session = await loginWithWechatCode(supabase, "login-code");

  assert.equal(session.user.uid, "1000000001");
  assert.equal("openid" in session.user, false);
  assert.equal(session.user.avatar_url, "");
  assert.equal(supabase.state.sessions.length, 1);
});

test("a successful local avatar update completes the user profile", async () => {
  const supabase = createFakeSupabase([
    {
      id: "internal-pending-user",
      uid: "1000000002",
      wechat_openid: "openid-pending",
      display_name: "待完善用户",
      avatar_url: "",
      profile_completed: false,
      created_at: "2026-07-11T00:00:00.000Z",
    },
  ]);
  const image = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="red"/></svg>',
  );

  const avatarUrl = await updateUserAvatar(supabase, "1000000002", {
    buffer: image,
    mimetype: "image/png",
    filename: "avatar.png",
  });

  assert.match(
    avatarUrl,
    /^https:\/\/assets\.example\/user-avatars\/users\/1000000002\/avatar-\d+-[0-9a-f-]+-master-v1\.webp\?expires=21600$/,
  );
  assert.equal(supabase.state.users[0].profile_completed, true);
  assert.match(
    supabase.state.users[0].avatar_url,
    /^users\/1000000002\/avatar-\d+-[0-9a-f-]+-master-v1\.webp$/,
  );
  assert.equal(supabase.state.uploads.length, 1);
  assert.equal(supabase.state.uploads[0].options.contentType, "image/webp");
  assert.equal(supabase.state.assetWrites.length, 1);
  assert.equal(supabase.state.assetWrites[0].module, "avatars");
  assert.equal(supabase.state.removals.length, 0);
});

test("updating a nickname preserves the account and completes its profile", async () => {
  const supabase = createFakeSupabase([
    {
      id: "internal-profile-user",
      uid: "1000000003",
      wechat_openid: "openid-profile",
      display_name: "旧昵称",
      avatar_url: "users/profile-user/avatar-old.webp",
      profile_completed: false,
      created_at: "2026-07-11T00:00:00.000Z",
    },
  ]);

  const displayName = await updateUserDisplayName(
    supabase,
    "1000000003",
    "  新昵称  ",
  );

  assert.equal(displayName, "新昵称");
  assert.equal(supabase.state.users[0].display_name, "新昵称");
  assert.equal(supabase.state.users[0].avatar_url, "users/profile-user/avatar-old.webp");
  assert.equal(supabase.state.users[0].profile_completed, true);
});

test("replacing an avatar switches to a versioned path before removing the old object", async () => {
  const supabase = createFakeSupabase([
    {
      id: "internal-avatar-user",
      uid: "1000000004",
      wechat_openid: "openid-avatar",
      display_name: "头像用户",
      avatar_url: "users/avatar-user/avatar-old.webp",
      profile_completed: true,
      created_at: "2026-07-11T00:00:00.000Z",
    },
  ]);
  const image = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="blue"/></svg>',
  );

  await updateUserAvatar(supabase, "1000000004", {
    buffer: image,
    mimetype: "image/png",
    filename: "avatar.png",
  });

  assert.match(
    supabase.state.users[0].avatar_url,
    /^users\/1000000004\/avatar-\d+-[0-9a-f-]+-master-v1\.webp$/,
  );
  assert.deepEqual(supabase.state.removals, [{
    bucket: "user-avatars",
    paths: ["users/avatar-user/avatar-old.webp"],
  }]);
});

test("temporary local avatar URLs are rejected by the login endpoint", async (context) => {
  mockWechatLogin(context, "openid-temporary-avatar");
  const supabase = createFakeSupabase();

  await assert.rejects(
    loginWithWechatCode(supabase, "temporary-avatar-code", {
      displayName: "测试用户",
      avatarUrl: "http://tmp/avatar.png",
    }),
    (error) => error?.statusCode === 400 && error?.code === "INVALID_AVATAR_URL",
  );
  assert.equal(supabase.state.users.length, 0);
  assert.equal(supabase.state.sessions.length, 0);
});

test("incomplete profile sessions can authenticate normal routes", async (context) => {
  mockWechatLogin(context, "openid-incomplete-profile");
  const supabase = createFakeSupabase();
  const session = await loginWithWechatCode(supabase, "incomplete-profile-code", {
    displayName: "待完善用户",
    avatarUrl: "",
  });
  const headers = { authorization: `Bearer ${session.token}` };

  const request = { headers };
  const auth = await requireAuth(supabase, request);
  assert.equal(auth.user.uid, supabase.state.users[0].uid);
  assert.equal(request.auth.user.uid, supabase.state.users[0].uid);
});

test("new users can sign up without avatar or nickname", async (context) => {
  mockWechatLogin(context, "openid-default-profile");
  const supabase = createFakeSupabase();

  const session = await loginWithWechatCode(supabase, "signup-code");

  assert.equal(session.user.display_name, "微信用户");
  assert.equal(session.user.avatar_url, "");
  assert.equal(supabase.state.users[0].profile_completed, false);
  assert.equal(supabase.state.sessions.length, 1);
});

test("closed registration blocks only new accounts", async (context) => {
  mockWechatLogin(context, "openid-new-closed");
  const newUserSupabase = createFakeSupabase();
  await assert.rejects(
    loginWithWechatCode(
      newUserSupabase,
      "new-user-code",
      {},
      { registrationEnabled: false, registrationMessage: "注册维护中。" },
    ),
    (error) => error?.code === "REGISTRATION_CLOSED" && error?.message === "注册维护中。",
  );
  assert.equal(newUserSupabase.state.users.length, 0);

  context.mock.restoreAll();
  mockWechatLogin(context, "openid-existing-closed");
  const existingSupabase = createFakeSupabase([{
    id: "internal-existing-closed",
    uid: "1000000009",
    wechat_openid: "openid-existing-closed",
    display_name: "已有用户",
    avatar_url: "",
    profile_completed: true,
    created_at: "2026-08-01T00:00:00.000Z",
  }]);
  const session = await loginWithWechatCode(
    existingSupabase,
    "existing-user-code",
    {},
    { registrationEnabled: false },
  );
  assert.equal(session.user.uid, "1000000009");
});

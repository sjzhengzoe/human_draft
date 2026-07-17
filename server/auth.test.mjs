import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WECHAT_APP_ID = "test-app-id";
process.env.WECHAT_APP_SECRET = "test-app-secret";

const { loginWithWechatCode, requireAuth } = await import("./lib/auth.mjs");
const { updateUserAvatar } = await import("./lib/user-profile.mjs");

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

  eq(column, value) {
    this.filters.push([column, value, "eq"]);
    return this;
  }

  gt(column, value) {
    this.filters.push([column, value, "gt"]);
    return this;
  }

  matches(row) {
    return this.filters.every(([column, value, operator]) =>
      operator === "gt" ? row[column] > value : row[column] === value,
    );
  }

  async execute() {
    if (this.table === "app_sessions" && this.operation === "insert") {
      this.state.sessions.push({
        id: `session-${this.state.sessions.length + 1}`,
        ...this.values,
      });
      return { data: null, error: null };
    }

    if (this.table === "app_sessions") {
      const session = this.state.sessions.find((candidate) => this.matches(candidate));
      return { data: session || null, error: null };
    }

    if (this.table !== "app_users") {
      throw new Error(`Unexpected fake table: ${this.table}`);
    }

    if (this.operation === "insert") {
      const user = {
        id: `user-${this.state.users.length + 1}`,
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
  };

  return {
    state,
    from(table) {
      return new FakeQuery(state, table);
    },
    storage: {
      from(bucket) {
        return {
          async upload(path, contents, options) {
            state.uploads.push({ bucket, path, contents, options });
            return { error: null };
          },
          getPublicUrl(path) {
            return {
              data: { publicUrl: `https://assets.example/${bucket}/${path}` },
            };
          },
        };
      },
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

test("a migrated completed user can still log in without an avatar", async (context) => {
  mockWechatLogin(context, "openid-existing");
  const supabase = createFakeSupabase([
    {
      id: "existing-user",
      wechat_openid: "openid-existing",
      display_name: "旧用户",
      avatar_url: "",
      profile_completed: true,
      created_at: "2026-07-10T00:00:00.000Z",
    },
  ]);

  const session = await loginWithWechatCode(supabase, "login-code");

  assert.equal(session.user.id, "existing-user");
  assert.equal(session.user.avatar_url, "");
  assert.equal(supabase.state.sessions.length, 1);
});

test("a successful local avatar update completes the user profile", async () => {
  const supabase = createFakeSupabase([
    {
      id: "pending-user",
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

  const avatarUrl = await updateUserAvatar(supabase, "pending-user", image);

  assert.match(avatarUrl, /^https:\/\/assets\.example\/user-avatars\/users\/pending-user\/avatar\.webp\?v=\d+$/);
  assert.equal(supabase.state.users[0].profile_completed, true);
  assert.equal(supabase.state.users[0].avatar_url, avatarUrl);
  assert.equal(supabase.state.uploads.length, 1);
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
  assert.equal(auth.user.id, supabase.state.users[0].id);
  assert.equal(request.auth.user.id, supabase.state.users[0].id);
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

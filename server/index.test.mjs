import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.WECHAT_ALLOWED_OPENIDS = "test-openid";
const { buildServer } = await import("./index.mjs");

const TEST_TOKEN = "test-token";
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000002";
const MEDIA_ID = "10000000-0000-4000-8000-000000000003";
const DINING_ID = "10000000-0000-4000-8000-000000000004";
const SOURCE_ID = "10000000-0000-4000-8000-000000000005";
const TARGET_ID = "10000000-0000-4000-8000-000000000006";
const SEASON_ID = "10000000-0000-4000-8000-000000000007";
const EPISODE_ID = "10000000-0000-4000-8000-000000000008";

function createFakeSupabase({ tables = {}, rpc = {} } = {}) {
  const rpcCalls = [];

  class Query {
    constructor(table) {
      this.rows = [...(tables[table] || [])];
      this.changes = null;
    }

    select() {
      return this;
    }

    delete() {
      return this;
    }

    update(changes) {
      this.changes = changes;
      return this;
    }

    eq(field, value) {
      this.rows = this.rows.filter((row) => row[field] === value);
      return this;
    }

    ilike(field, pattern) {
      const keyword = String(pattern).replace(/^%|%$/g, "").toLocaleLowerCase();
      this.rows = this.rows.filter((row) =>
        String(row[field] || "").toLocaleLowerCase().includes(keyword)
      );
      return this;
    }

    gt(field, value) {
      this.rows = this.rows.filter((row) => row[field] > value);
      return this;
    }

    order() {
      return this;
    }

    async range(from, to) {
      const count = this.rows.length;
      this.rows = this.rows.slice(from, to + 1);
      return { data: this.materialize(), error: null, count };
    }

    materialize() {
      if (this.changes) this.rows.forEach((row) => Object.assign(row, this.changes));
      return this.rows;
    }

    async maybeSingle() {
      return { data: this.materialize()[0] || null, error: null };
    }

    async single() {
      return { data: this.materialize()[0] || null, error: null };
    }

    then(resolve, reject) {
      return Promise.resolve({ data: this.materialize(), error: null }).then(resolve, reject);
    }
  }

  const supabase = {
    rpcCalls,
    from(table) {
      return new Query(table);
    },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      const handler = rpc[name];
      const result =
        typeof handler === "function"
          ? handler(params)
          : handler || { data: null, error: null };
      const promise = Promise.resolve(result);
      return {
        single: () => promise,
        then: (resolve, reject) => promise.then(resolve, reject),
      };
    },
  };

  return supabase;
}

function authenticatedTables(extra = {}) {
  return {
    app_sessions: [
      {
        id: SESSION_ID,
        user_id: USER_ID,
        token_hash: createHash("sha256").update(TEST_TOKEN).digest("hex"),
        expires_at: "2999-01-01T00:00:00.000Z",
      },
    ],
    app_users: [
      {
        id: USER_ID,
        wechat_openid: "test-openid",
        display_name: "测试用户",
        avatar_url: "",
        profile_completed: true,
        created_at: "2026-07-11T00:00:00.000Z",
      },
    ],
    ...extra,
  };
}

const authHeaders = { authorization: `Bearer ${TEST_TOKEN}` };

test("health endpoint reports configuration state without exposing secrets", async () => {
  const app = buildServer({ logger: false });
  const response = await app.inject({ method: "GET", url: "/api/health" });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.service, "project-flomo-server");
  assert.equal(typeof body.configured, "boolean");
  assert.ok(Array.isArray(body.missing_config));
  assert.equal(JSON.stringify(body).includes("sb_secret_"), false);
  await app.close();
});

test("unknown API path returns a JSON 404", async () => {
  const app = buildServer({ logger: false });
  const response = await app.inject({ method: "GET", url: "/api/unknown" });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), {
    ok: false,
    error: { code: "NOT_FOUND", message: "Not Found" },
  });
  await app.close();
});

test("media and dining detail routes load records by id", async (t) => {
  const media = {
    id: MEDIA_ID,
    title: "千与千寻",
    media_type: "动画",
    watch_status: "completed",
    platforms: ["哔哩哔哩"],
    sort_order: 1000,
  };
  const dining = {
    id: DINING_ID,
    name: "街角面馆",
    service_modes: ["dine_in"],
    menu_items: ["牛肉面"],
    sort_order: 1000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        media_entries: [media],
        dining_places: [dining],
      }),
    }),
  });
  t.after(() => app.close());

  const mediaResponse = await app.inject({
    method: "GET",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
  });
  assert.equal(mediaResponse.statusCode, 200);
  assert.deepEqual(mediaResponse.json(), { ok: true, data: { item: media } });

  const diningResponse = await app.inject({
    method: "GET",
    url: `/api/dining/${DINING_ID}`,
    headers: authHeaders,
  });
  assert.equal(diningResponse.statusCode, 200);
  assert.deepEqual(diningResponse.json(), { ok: true, data: { item: dining } });

  const missingResponse = await app.inject({
    method: "GET",
    url: "/api/media/10000000-0000-4000-8000-000000000099",
    headers: authHeaders,
  });
  assert.equal(missingResponse.statusCode, 404);
  assert.equal(missingResponse.json().error.code, "RECORD_NOT_FOUND");

  const unauthenticatedResponse = await app.inject({
    method: "GET",
    url: `/api/dining/${DINING_ID}`,
  });
  assert.equal(unauthenticatedResponse.statusCode, 401);
  assert.equal(unauthenticatedResponse.json().error.code, "UNAUTHORIZED");
});

test("media list supports server-side pagination and fuzzy title search", async (t) => {
  const entries = Array.from({ length: 25 }, (_, index) => ({
    id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    title: index === 3 ? "默读" : index === 17 ? "沉默的真相" : `广播剧 ${index + 1}`,
    media_type: "广播剧",
    watch_status: "completed",
    platforms: [],
    sort_order: (index + 1) * 1000,
  }));
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: entries }),
    }),
  });
  t.after(() => app.close());

  const pageResponse = await app.inject({
    method: "GET",
    url: "/api/media?media_type=%E5%B9%BF%E6%92%AD%E5%89%A7&page=2&page_size=10",
    headers: authHeaders,
  });
  assert.equal(pageResponse.statusCode, 200);
  assert.equal(pageResponse.json().data.items.length, 10);
  assert.deepEqual(pageResponse.json().data.pagination, {
    page: 2,
    page_size: 10,
    total: 25,
    has_more: true,
  });

  const searchResponse = await app.inject({
    method: "GET",
    url: "/api/media?media_type=%E5%B9%BF%E6%92%AD%E5%89%A7&keyword=%E9%BB%98&page_size=1",
    headers: authHeaders,
  });
  assert.equal(searchResponse.statusCode, 200);
  assert.equal(searchResponse.json().data.items[0].title, "默读");
  assert.deepEqual(searchResponse.json().data.pagination, {
    page: 1,
    page_size: 1,
    total: 2,
    has_more: true,
  });
});

test("episodic media routes expose seasons, favorites, and episode updates", async (t) => {
  const episode = {
    id: EPISODE_ID,
    season_id: SEASON_ID,
    episode_number: 2,
    title: "重逢",
    plot_summary: "两人在车站重逢。",
    is_favorite: true,
  };
  const season = {
    id: SEASON_ID,
    media_entry_id: MEDIA_ID,
    name: "第一季",
    sort_order: 1000,
    media_episodes: [episode],
  };
  const media = {
    id: MEDIA_ID,
    title: "测试广播剧",
    media_type: "广播剧",
    watch_status: "completed",
    platforms: ["猫耳"],
    is_revisitable: true,
    season_count: 1,
    episode_count: 1,
    favorite_episode_count: 1,
    sort_order: 1000,
  };
  const favorite = {
    id: EPISODE_ID,
    season_id: SEASON_ID,
    media_entry_id: MEDIA_ID,
    media_title: media.title,
    media_type: media.media_type,
    platforms: media.platforms,
    season_name: season.name,
    episode_number: episode.episode_number,
    episode_title: episode.title,
    plot_summary: episode.plot_summary,
  };
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      media_entries: [media],
      media_seasons: [season],
      media_episodes: [episode],
    }),
    rpc: {
      search_favorite_media_episodes: { data: [favorite], error: null },
      create_media_season_with_episodes: (params) => ({
        data: {
          id: TARGET_ID,
          media_entry_id: params.p_media_entry_id,
          name: params.p_name,
          sort_order: 2000,
        },
        error: null,
      }),
    },
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const seasonsResponse = await app.inject({
    method: "GET",
    url: `/api/media/${MEDIA_ID}/seasons`,
    headers: authHeaders,
  });
  assert.equal(seasonsResponse.statusCode, 200);
  assert.deepEqual(seasonsResponse.json().data.items[0].episodes, [episode]);

  const favoritesResponse = await app.inject({
    method: "GET",
    url: "/api/media-episodes/favorites?media_type=%E5%B9%BF%E6%92%AD%E5%89%A7&keyword=%E8%BD%A6%E7%AB%99",
    headers: authHeaders,
  });
  assert.equal(favoritesResponse.statusCode, 200);
  assert.deepEqual(favoritesResponse.json().data.items, [favorite]);

  const createSeasonResponse = await app.inject({
    method: "POST",
    url: `/api/media/${MEDIA_ID}/seasons`,
    headers: authHeaders,
    payload: { name: "第二季", episode_count: 12 },
  });
  assert.equal(createSeasonResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls.at(-1), {
    name: "create_media_season_with_episodes",
    params: { p_media_entry_id: MEDIA_ID, p_name: "第二季", p_episode_count: 12 },
  });

  const updateEpisodeResponse = await app.inject({
    method: "PUT",
    url: `/api/media-episodes/${EPISODE_ID}`,
    headers: authHeaders,
    payload: { is_favorite: false, plot_summary: "更新后的剧情" },
  });
  assert.equal(updateEpisodeResponse.statusCode, 200);
  assert.equal(updateEpisodeResponse.json().data.item.is_favorite, false);
  assert.equal(updateEpisodeResponse.json().data.item.plot_summary, "更新后的剧情");
});

test("delete routes return a JSON success envelope", async (t) => {
  const media = {
    id: MEDIA_ID,
    title: "待删除影视",
    media_type: "电影",
    watch_status: "planned",
    platforms: [],
    sort_order: 1000,
  };
  const dining = {
    id: DINING_ID,
    name: "待删除店铺",
    service_modes: ["takeout"],
    menu_items: [],
    sort_order: 1000,
  };
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      media_entries: [media],
      dining_places: [dining],
    }),
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  for (const url of [`/api/media/${MEDIA_ID}`, `/api/dining/${DINING_ID}`]) {
    const response = await app.inject({ method: "DELETE", url, headers: authHeaders });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, data: { deleted: true } });
  }
});

test("media writes validate and normalize platforms before the create RPC", async (t) => {
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      media_entries: [{
        id: TARGET_ID,
        title: "千与千寻",
        media_type: "电影",
        watch_status: "completed",
        platforms: [],
        sort_order: 1000,
      }],
    }),
    rpc: {
      create_media_entry_at_end: (params) => ({
        data: {
          id: MEDIA_ID,
          title: params.p_title,
          media_type: params.p_media_type,
          watch_status: params.p_watch_status,
          platforms: params.p_platforms,
          sort_order: 1000,
        },
        error: null,
      }),
    },
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const invalidResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "非法平台条目",
      media_type: "电影",
      watch_status: "planned",
      platforms: ["Netflix"],
    },
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.json().error.code, "INVALID_MEDIA_PLATFORM");
  assert.equal(supabase.rpcCalls.length, 0);

  const duplicateResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: " 千与千寻 ",
      media_type: "电影",
      platforms: [],
    },
  });
  assert.equal(duplicateResponse.statusCode, 409);
  assert.equal(duplicateResponse.json().error.code, "MEDIA_TITLE_EXISTS");
  assert.equal(supabase.rpcCalls.length, 0);

  const validResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "合法平台条目",
      media_type: "电影",
      platforms: ["猫耳", "猫耳", "漫播"],
    },
  });
  assert.equal(validResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls[0], {
    name: "create_media_entry_at_end",
    params: {
      p_title: "合法平台条目",
      p_media_type: "电影",
      p_watch_status: "completed",
      p_platforms: ["猫耳", "漫播"],
    },
  });
});

test("cross-type media updates use the destination-locked move RPC", async (t) => {
  const existing = {
    id: MEDIA_ID,
    title: "旧标题",
    media_type: "电影",
    watch_status: "planned",
    platforms: ["腾讯视频"],
    sort_order: 1000,
  };
  const supabase = createFakeSupabase({
    tables: authenticatedTables({ media_entries: [existing] }),
    rpc: {
      move_media_entry_to_type_at_end: (params) => ({
        data: {
          id: params.p_entry_id,
          title: params.p_title ?? existing.title,
          media_type: params.p_media_type,
          watch_status: params.p_watch_status ?? existing.watch_status,
          platforms: params.p_platforms ?? existing.platforms,
          sort_order: 2000,
        },
        error: null,
      }),
    },
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: {
      title: "新标题",
      media_type: "动漫",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(supabase.rpcCalls, [
    {
      name: "move_media_entry_to_type_at_end",
      params: {
        p_entry_id: MEDIA_ID,
        p_title: "新标题",
        p_media_type: "动漫",
        p_watch_status: null,
        p_platforms: null,
      },
    },
  ]);
  assert.deepEqual(response.json().data.item, {
    id: MEDIA_ID,
    title: "新标题",
    media_type: "动漫",
    watch_status: "planned",
    platforms: ["腾讯视频"],
    sort_order: 2000,
  });
});

test("media edits reject a duplicate title in the same category", async (t) => {
  const existing = {
    id: MEDIA_ID,
    title: "原名称",
    media_type: "电影",
    watch_status: "completed",
    platforms: [],
    sort_order: 1000,
  };
  const duplicate = {
    ...existing,
    id: TARGET_ID,
    title: "重复名称",
    sort_order: 2000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: [existing, duplicate] }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { title: " 重复名称 " },
  });

  assert.equal(response.statusCode, 409);
  assert.equal(response.json().error.code, "MEDIA_TITLE_EXISTS");
});

test("swap routes map only their expected SQLSTATE errors", async (t) => {
  const successfulSupabase = createFakeSupabase({
    tables: authenticatedTables(),
    rpc: { swap_dish_sort_orders: { data: null, error: null } },
  });
  const successfulSwapApp = buildServer({
    logger: false,
    supabase: successfulSupabase,
  });
  t.after(() => successfulSwapApp.close());

  const successfulResponse = await successfulSwapApp.inject({
    method: "PUT",
    url: "/api/dishes/order/swap",
    headers: authHeaders,
    payload: { source_id: SOURCE_ID, target_id: TARGET_ID },
  });
  assert.equal(successfulResponse.statusCode, 200);
  assert.deepEqual(successfulResponse.json(), {
    ok: true,
    data: { updated: 2 },
  });
  assert.deepEqual(successfulSupabase.rpcCalls[0], {
    name: "swap_dish_sort_orders",
    params: { p_source_id: SOURCE_ID, p_target_id: TARGET_ID },
  });

  const dishNotFoundApp = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables(),
      rpc: {
        swap_dish_sort_orders: {
          data: null,
          error: { code: "P0002", message: "db not found" },
        },
      },
    }),
  });
  t.after(() => dishNotFoundApp.close());

  const dishResponse = await dishNotFoundApp.inject({
    method: "PUT",
    url: "/api/dishes/order/swap",
    headers: authHeaders,
    payload: { source_id: SOURCE_ID, target_id: TARGET_ID },
  });
  assert.equal(dishResponse.statusCode, 404);
  assert.deepEqual(dishResponse.json().error, {
    code: "DISH_NOT_FOUND",
    message: "交换位置的菜品不存在。",
  });

  const invalidMediaApp = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables(),
      rpc: {
        swap_media_entry_sort_orders: {
          data: null,
          error: { code: "22023", message: "db invalid argument" },
        },
      },
    }),
  });
  t.after(() => invalidMediaApp.close());

  const mediaResponse = await invalidMediaApp.inject({
    method: "PUT",
    url: "/api/media/order/swap",
    headers: authHeaders,
    payload: { source_id: SOURCE_ID, target_id: TARGET_ID },
  });
  assert.equal(mediaResponse.statusCode, 400);
  assert.deepEqual(mediaResponse.json().error, {
    code: "INVALID_MEDIA_SWAP",
    message: "只能交换同一分类下的影视条目。",
  });

  const unknownDatabaseErrorApp = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables(),
      rpc: {
        swap_dish_sort_orders: {
          data: null,
          error: { code: "42P01", message: "missing table" },
        },
      },
    }),
  });
  t.after(() => unknownDatabaseErrorApp.close());

  const unknownResponse = await unknownDatabaseErrorApp.inject({
    method: "PUT",
    url: "/api/dishes/order/swap",
    headers: authHeaders,
    payload: { source_id: SOURCE_ID, target_id: TARGET_ID },
  });
  assert.equal(unknownResponse.statusCode, 500);
  assert.deepEqual(unknownResponse.json().error, {
    code: "DATABASE_ERROR",
    message: "交换菜品排序失败。",
  });
});

test("reorder routes map invalid database order lists to HTTP 400", async (t) => {
  const invalidOrder = { data: null, error: { code: "22023", message: "invalid order" } };
  const supabase = createFakeSupabase({
    tables: authenticatedTables(),
    rpc: {
      reorder_dishes: invalidOrder,
      reorder_media_entries: invalidOrder,
    },
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const dishResponse = await app.inject({
    method: "PUT",
    url: "/api/dishes/reorder",
    headers: authHeaders,
    payload: { ids: [SOURCE_ID] },
  });
  assert.equal(dishResponse.statusCode, 400);
  assert.equal(dishResponse.json().error.code, "INVALID_DISH_ORDER");

  const mediaResponse = await app.inject({
    method: "PUT",
    url: "/api/media/reorder",
    headers: authHeaders,
    payload: { media_type: "电影", ids: [SOURCE_ID] },
  });
  assert.equal(mediaResponse.statusCode, 400);
  assert.equal(mediaResponse.json().error.code, "INVALID_MEDIA_ORDER");
});

test("sort-order migration declares atomic create and deferrable swap contracts", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607110007_sort_order_integrity.sql", import.meta.url),
    "utf8",
  );
  const hardeningMigration = await readFile(
    new URL("../supabase/migrations/202607110008_auth_and_sort_concurrency.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /lock table public\.dishes, public\.media_entries in access exclusive mode/i);
  assert.match(migration, /create or replace function public\.create_dish_at_end/);
  assert.match(migration, /create or replace function public\.create_media_entry_at_end/);
  assert.match(
    migration,
    /create or replace function public\.move_media_entry_to_type_at_end/,
  );
  assert.match(migration, /pg_advisory_xact_lock/g);
  assert.match(
    migration,
    /hashtextextended\('public\.media_entries:sort_order:' \|\| p_media_type, 0\)/,
  );
  assert.match(migration, /unique \(sort_order\)\s+deferrable initially immediate/i);
  assert.match(
    migration,
    /unique \(media_type, sort_order\)\s+deferrable initially immediate/i,
  );
  assert.match(migration, /set constraints dishes_sort_order_unique deferred/i);
  assert.match(
    migration,
    /set constraints media_entries_type_sort_order_unique deferred/i,
  );
  assert.match(
    hardeningMigration,
    /alter column profile_completed set default false/i,
  );
  assert.doesNotMatch(
    hardeningMigration,
    /public\.media_entries:sort_order:'\s*\|\|\s*p_media_type/,
  );
  assert.ok(
    (hardeningMigration.match(/hashtextextended\('public\.media_entries:sort_order', 0\)/g) || [])
      .length >= 4,
  );
  assert.match(
    hardeningMigration,
    /create or replace function public\.swap_dish_sort_orders[\s\S]*?pg_advisory_xact_lock/,
  );
  assert.match(
    hardeningMigration,
    /create or replace function public\.swap_media_entry_sort_orders[\s\S]*?pg_advisory_xact_lock/,
  );
  assert.match(hardeningMigration, /get diagnostics locked_count = row_count/gi);
  assert.match(hardeningMigration, /updated_requested_count <> expected_count/gi);
});

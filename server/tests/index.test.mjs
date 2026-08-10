import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";

process.env.NODE_ENV = "test";
process.env.WECHAT_ALLOWED_OPENIDS = "test-openid";
const { buildServer } = await import("../index.mjs");

const TEST_TOKEN = "test-token";
const SESSION_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "10000000-0000-4000-8000-000000000002";
const MEDIA_ID = "10000000-0000-4000-8000-000000000003";
const DINING_ID = "10000000-0000-4000-8000-000000000004";
const SOURCE_ID = "10000000-0000-4000-8000-000000000005";
const TARGET_ID = "10000000-0000-4000-8000-000000000006";
const SEASON_ID = "10000000-0000-4000-8000-000000000007";
const EPISODE_ID = "10000000-0000-4000-8000-000000000008";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000009";

function createFakeSupabase({ tables = {}, rpc = {} } = {}) {
  const rpcCalls = [];
  const orderCalls = [];
  const storageUploads = [];
  const storageRemovals = [];

  class Query {
    constructor(table) {
      this.table = table;
      this.rows = [...(tables[table] || [])];
      this.changes = null;
    }

    select() {
      return this;
    }

    delete() {
      return this;
    }

    insert(values) {
      this.rows = Array.isArray(values) ? [...values] : [values];
      return this;
    }

    update(changes) {
      this.changes = changes;
      return this;
    }

    eq(field, value) {
      this.rows = this.rows.filter((row) =>
        field === "user_id"
          ? (row[field] ?? USER_ID) === value
          : row[field] === value
      );
      return this;
    }

    in(field, values) {
      this.rows = this.rows.filter((row) => values.includes(row[field]));
      return this;
    }

    is(field, value) {
      this.rows = this.rows.filter((row) => row[field] === value || (value === null && row[field] == null));
      return this;
    }

    not(field, operator, value) {
      if (operator === "is" && value === null) {
        this.rows = this.rows.filter((row) => row[field] != null);
      }
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

    gte(field, value) {
      this.rows = this.rows.filter((row) => row[field] >= value);
      return this;
    }

    lte(field, value) {
      this.rows = this.rows.filter((row) => row[field] <= value);
      return this;
    }

    lt(field, value) {
      this.rows = this.rows.filter((row) => row[field] < value);
      return this;
    }

    order(field, options) {
      orderCalls.push({ table: this.table, field, options });
      return this;
    }

    async limit(count) {
      this.rows = this.rows.slice(0, count);
      return { data: this.materialize(), error: null };
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
    orderCalls,
    storageUploads,
    storageRemovals,
    storage: {
      from(bucket) {
        return {
          async upload(path, buffer, options) {
            storageUploads.push({ bucket, path, buffer, options });
            return { data: { path }, error: null };
          },
          async remove(paths) {
            storageRemovals.push({ bucket, paths });
            return { data: paths, error: null };
          },
          getPublicUrl(path) {
            return { data: { publicUrl: `https://example.test/${bucket}/${path || ""}` } };
          },
        };
      },
    },
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
  assert.equal(body.service, "human-draft-server");
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

test("authenticated template text is checked before use", async () => {
  const checked = [];
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({ tables: authenticatedTables() }),
    contentSecurity: {
      async checkText(openId, content) {
        checked.push({ openId, content });
      },
      async checkImage() {},
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/content-security/text",
    headers: authHeaders,
    payload: { content: "准备生成图片的文案" },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    data: { safe: true },
  });
  assert.deepEqual(checked, [
    { openId: "test-openid", content: "准备生成图片的文案" },
  ]);
  await app.close();
});

test("chat topics list official examples and only the authenticated user's topics", async (t) => {
  const officialTopic = {
    id: "20000000-0000-4000-8000-000000000001",
    content: "最近有什么小事，让你觉得生活很可爱？",
    sort_order: 1000,
    is_active: true,
  };
  const hiddenOfficialTopic = {
    id: "20000000-0000-4000-8000-000000000002",
    content: "这个话题已被当前用户标记为不喜欢",
    sort_order: 2000,
    is_active: true,
  };
  const extraOfficialTopics = Array.from({ length: 11 }, (_, index) => ({
    id: `21000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    content: `分页测试官方话题 ${index + 1}`,
    sort_order: 3000 + index * 1000,
    is_active: true,
  }));
  const mine = {
    id: "30000000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    official_topic_id: officialTopic.id,
    content: officialTopic.content,
  };
  const anotherUsersTopic = {
    id: "30000000-0000-4000-8000-000000000002",
    user_id: OTHER_USER_ID,
    official_topic_id: null,
    content: "不应返回的话题",
  };
  const checked = [];
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        official_chat_topics: [officialTopic, hiddenOfficialTopic, ...extraOfficialTopics],
        user_chat_topics: [mine, anotherUsersTopic],
        user_hidden_official_chat_topics: [
          { user_id: USER_ID, official_topic_id: hiddenOfficialTopic.id },
          { user_id: OTHER_USER_ID, official_topic_id: officialTopic.id },
        ],
      }),
    }),
    contentSecurity: {
      async checkText(openId, content) {
        checked.push({ openId, content });
      },
      async checkImage() {},
    },
  });
  t.after(() => app.close());

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/chat-topics",
    headers: authHeaders,
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().data.official_items.length, 5);
  assert.equal(listResponse.json().data.official_items[0].id, extraOfficialTopics[0].id);
  assert.deepEqual(listResponse.json().data.official_pagination, {
    page: 1,
    page_size: 5,
    total: 11,
    total_pages: 3,
  });
  assert.deepEqual(listResponse.json().data.my_items, [mine]);

  const hiddenListResponse = await app.inject({
    method: "GET",
    url: "/api/chat-topics/official/hidden?page=1&page_size=10",
    headers: authHeaders,
  });
  assert.equal(hiddenListResponse.statusCode, 200);
  assert.deepEqual(hiddenListResponse.json().data.items, [hiddenOfficialTopic]);
  assert.equal(hiddenListResponse.json().data.pagination.total, 1);

  const secondPageResponse = await app.inject({
    method: "GET",
    url: "/api/chat-topics?page=2&page_size=10",
    headers: authHeaders,
  });
  assert.equal(secondPageResponse.statusCode, 200);
  assert.equal(secondPageResponse.json().data.official_items.length, 1);
  assert.equal(secondPageResponse.json().data.official_pagination.page, 2);

  const restoreResponse = await app.inject({
    method: "DELETE",
    url: `/api/chat-topics/official/${hiddenOfficialTopic.id}/hide`,
    headers: authHeaders,
  });
  assert.equal(restoreResponse.statusCode, 200);
  assert.equal(restoreResponse.json().data.restored, true);

  const officialEditResponse = await app.inject({
    method: "PUT",
    url: `/api/chat-topics/mine/${mine.id}`,
    headers: authHeaders,
    payload: { content: "试图修改官方话题" },
  });
  assert.equal(officialEditResponse.statusCode, 403);
  assert.equal(officialEditResponse.json().error.code, "OFFICIAL_TOPIC_READ_ONLY");

  const dislikeResponse = await app.inject({
    method: "POST",
    url: `/api/chat-topics/official/${officialTopic.id}/dislike`,
    headers: authHeaders,
  });
  assert.equal(dislikeResponse.statusCode, 200);
  assert.equal(dislikeResponse.json().data.hidden, true);

  const officialUpdateResponse = await app.inject({
    method: "PUT",
    url: `/api/chat-topics/official/${officialTopic.id}`,
    headers: authHeaders,
    payload: { content: "管理员更新后的官方话题" },
  });
  assert.equal(officialUpdateResponse.statusCode, 200);
  assert.equal(
    officialUpdateResponse.json().data.item.content,
    "管理员更新后的官方话题",
  );
  assert.equal(mine.content, "最近有什么小事，让你觉得生活很可爱？");

  const createResponse = await app.inject({
    method: "POST",
    url: "/api/chat-topics/mine",
    headers: authHeaders,
    payload: { content: "  最近最想分享的事情是什么？  " },
  });
  assert.equal(createResponse.statusCode, 201);
  assert.equal(createResponse.json().data.item.content, "最近最想分享的事情是什么？");

  const officialCreateResponse = await app.inject({
    method: "POST",
    url: "/api/chat-topics/official",
    headers: authHeaders,
    payload: { content: "  只有管理员可以添加的官方话题  " },
  });
  assert.equal(officialCreateResponse.statusCode, 201);
  assert.equal(
    officialCreateResponse.json().data.item.content,
    "只有管理员可以添加的官方话题",
  );
  assert.deepEqual(checked, [
    { openId: "test-openid", content: "管理员更新后的官方话题" },
    { openId: "test-openid", content: "最近最想分享的事情是什么？" },
    { openId: "test-openid", content: "只有管理员可以添加的官方话题" },
  ]);

  const officialDeleteResponse = await app.inject({
    method: "DELETE",
    url: `/api/chat-topics/official/${officialTopic.id}`,
    headers: authHeaders,
  });
  assert.equal(officialDeleteResponse.statusCode, 200);
  assert.equal(officialDeleteResponse.json().data.deleted, true);
  assert.equal(mine.content, "最近有什么小事，让你觉得生活很可爱？");
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

test("menu overview combines metadata, permissions, and initial content", async (t) => {
  const category = {
    id: SOURCE_ID,
    user_id: USER_ID,
    name: "家常菜",
    sort_order: 1000,
    created_at: "2026-08-01T00:00:00.000Z",
  };
  const outsideCategory = {
    id: TARGET_ID,
    user_id: USER_ID,
    name: "面馆",
    sort_order: 1000,
  };
  const secondOutsideCategory = {
    id: SEASON_ID,
    user_id: USER_ID,
    name: "咖啡店",
    sort_order: 2000,
  };
  const homePlace = {
    id: DINING_ID,
    user_id: USER_ID,
    name: "家",
    place_type: "home",
    outside_category_id: null,
    image_path: "",
    thumbnail_path: null,
    sort_order: 1000,
    source_dish_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const dish = {
    id: MEDIA_ID,
    user_id: USER_ID,
    name: "番茄炒鸡蛋",
    record_type: "home",
    category_id: SOURCE_ID,
    outside_category_id: null,
    recommended_items: [],
    main_ingredients: ["番茄", "鸡蛋"],
    introduction: "",
    cooking_methods: ["cooking_01"],
    taste: ["taste_04"],
    flavor_options: [],
    image_path: "dishes/tomato.webp",
    thumbnail_path: "dishes/tomato-thumb.webp",
    meal_periods: ["lunch", "dinner"],
    place_id: DINING_ID,
    place_sort_order: 1000,
    sort_order: 1000,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const outsidePlaces = [
    {
      id: EPISODE_ID,
      user_id: USER_ID,
      name: "街角面馆",
      place_type: "outside",
      outside_category_id: TARGET_ID,
      image_path: "",
      thumbnail_path: null,
      sort_order: 1000,
      source_dish_id: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
    {
      id: "10000000-0000-4000-8000-000000000010",
      user_id: USER_ID,
      name: "巷口咖啡",
      place_type: "outside",
      outside_category_id: SEASON_ID,
      image_path: "",
      thumbnail_path: null,
      sort_order: 2000,
      source_dish_id: null,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    },
  ];
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        categories: [category],
        dining_scenes: [outsideCategory, secondOutsideCategory],
        menu_places: [homePlace, ...outsidePlaces],
        dishes: [dish],
      }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/menu-overview?record_type=home",
    headers: authHeaders,
  });
  assert.equal(response.statusCode, 200);
  const overview = response.json().data;
  assert.equal(overview.can_write, true);
  assert.equal(overview.home_place_id, DINING_ID);
  assert.equal(overview.active_filter, `home:${SOURCE_ID}`);
  assert.equal(overview.active_record_type, "home");
  assert.equal(overview.categories[0].name, "家常菜");
  assert.equal(overview.outside_categories[0].name, "面馆");
  assert.equal(overview.dishes[0].name, "番茄炒鸡蛋");
  assert.deepEqual(overview.outside_places, []);

  const outsideResponse = await app.inject({
    method: "GET",
    url: "/api/menu-overview?record_type=outside",
    headers: authHeaders,
  });
  assert.equal(outsideResponse.statusCode, 200);
  const outsideOverview = outsideResponse.json().data;
  assert.equal(outsideOverview.active_filter, "outside");
  assert.deepEqual(
    outsideOverview.outside_places.map((place) => place.name),
    ["街角面馆", "巷口咖啡"],
  );

  const filteredOutsideResponse = await app.inject({
    method: "GET",
    url: `/api/menu-overview?record_type=outside&category_id=${TARGET_ID}`,
    headers: authHeaders,
  });
  assert.equal(filteredOutsideResponse.statusCode, 200);
  const filteredOutsideOverview = filteredOutsideResponse.json().data;
  assert.equal(filteredOutsideOverview.active_filter, `outside:${TARGET_ID}`);
  assert.deepEqual(
    filteredOutsideOverview.outside_places.map((place) => place.name),
    ["街角面馆"],
  );
});

test("menu schedule lists dated meals and ranks outside dishes by their store", async (t) => {
  const firstMealId = "40000000-0000-4000-8000-000000000001";
  const secondMealId = "40000000-0000-4000-8000-000000000002";
  const homeDishId = "40000000-0000-4000-8000-000000000003";
  const outsideDishId = "40000000-0000-4000-8000-000000000004";
  const storeId = "40000000-0000-4000-8000-000000000005";
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        menu_schedule_meals: [
          { id: firstMealId, user_id: USER_ID, meal_date: "2026-08-03", meal_period: "lunch", slot_count: 3 },
          { id: secondMealId, user_id: USER_ID, meal_date: "2026-08-04", meal_period: "dinner", slot_count: 3 },
        ],
        menu_schedule_items: [
          { id: "41000000-0000-4000-8000-000000000001", user_id: USER_ID, meal_id: firstMealId, source_kind: "dish", record_type: "home", dish_id: homeDishId, place_id: DINING_ID, snapshot_name: "番茄炒鸡蛋", snapshot_place_name: "", snapshot_image_path: "home.webp", position: 0 },
          { id: "41000000-0000-4000-8000-000000000002", user_id: USER_ID, meal_id: firstMealId, source_kind: "dish", record_type: "outside", dish_id: outsideDishId, place_id: storeId, snapshot_name: "牛肉面", snapshot_place_name: "街角面馆", snapshot_image_path: "noodle.webp", position: 1 },
          { id: "41000000-0000-4000-8000-000000000003", user_id: USER_ID, meal_id: firstMealId, source_kind: "place", record_type: "outside", dish_id: null, place_id: storeId, snapshot_name: "街角面馆", snapshot_place_name: "街角面馆", snapshot_image_path: "store.webp", position: 2 },
          { id: "41000000-0000-4000-8000-000000000004", user_id: USER_ID, meal_id: secondMealId, source_kind: "dish", record_type: "home", dish_id: homeDishId, place_id: DINING_ID, snapshot_name: "番茄炒鸡蛋", snapshot_place_name: "", snapshot_image_path: "home.webp", position: 0 },
        ],
      }),
    }),
  });
  t.after(() => app.close());

  const scheduleResponse = await app.inject({
    method: "GET",
    url: "/api/menu-schedule?start=2026-08-03&end=2026-08-09",
    headers: authHeaders,
  });
  assert.equal(scheduleResponse.statusCode, 200);
  assert.equal(scheduleResponse.json().data.meals.length, 2);
  assert.equal(scheduleResponse.json().data.meals[0].items.length, 3);

  const rankingResponse = await app.inject({
    method: "GET",
    url: "/api/menu-ranking?start=2026-08-03&end=2026-08-09",
    headers: authHeaders,
  });
  assert.equal(rankingResponse.statusCode, 200);
  assert.deepEqual(
    rankingResponse.json().data.items.map((item) => ({ name: item.name, type: item.type, count: item.count })),
    [
      { name: "番茄炒鸡蛋", type: "dish", count: 2 },
      { name: "街角面馆", type: "place", count: 1 },
    ],
  );
});

test("menu schedule migration adds isolated history tables without rewriting legacy menu rows", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608100001_menu_schedule.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.menu_schedule_meals/i);
  assert.match(migration, /create table if not exists public\.menu_schedule_items/i);
  assert.match(migration, /create table if not exists public\.menu_favorites/i);
  assert.match(migration, /unique \(user_id, meal_date, meal_period\)/i);
  assert.match(migration, /replace_menu_schedule_meal\(/i);
  assert.match(migration, /alter table public\.menu_schedule_meals enable row level security/i);
  assert.doesNotMatch(migration, /delete from public\.dishes|drop table public\.dishes/i);
});

test("menu places expose stores first and their linked dishes separately", async (t) => {
  const place = {
    id: DINING_ID,
    user_id: USER_ID,
    name: "街角面馆",
    place_type: "outside",
    outside_category_id: SOURCE_ID,
    outside_category: { id: SOURCE_ID, name: "面馆" },
    image_path: "stores/noodle.webp",
    thumbnail_path: "stores/noodle-thumb.webp",
    sort_order: 1000,
    source_dish_id: DINING_ID,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const dish = {
    id: TARGET_ID,
    user_id: USER_ID,
    name: "牛肉面",
    record_type: "outside",
    category_id: null,
    outside_category_id: SOURCE_ID,
    recommended_items: [],
    main_ingredients: ["牛肉", "面条"],
    introduction: "汤浓面香",
    cooking_methods: ["cooking_02"],
    taste: ["taste_03", "taste_04"],
    flavor_options: [],
    image_path: "",
    thumbnail_path: null,
    meal_periods: ["lunch", "dinner"],
    place_id: DINING_ID,
    place_sort_order: 1000,
    sort_order: 2000,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ menu_places: [place], dishes: [dish] }),
    }),
  });
  t.after(() => app.close());

  const placeResponse = await app.inject({
    method: "GET",
    url: "/api/menu-places?place_type=outside",
    headers: authHeaders,
  });
  assert.equal(placeResponse.statusCode, 200);
  assert.equal(placeResponse.json().data.items[0].name, "街角面馆");
  assert.equal(placeResponse.json().data.items[0].dish_count, 1);
  assert.equal(placeResponse.json().data.items[0].dishes[0].name, "牛肉面");
  assert.equal(placeResponse.json().data.items[0].dishes[0].introduction, "汤浓面香");
  assert.deepEqual(placeResponse.json().data.items[0].dishes[0].main_ingredients, ["牛肉", "面条"]);
  assert.deepEqual(placeResponse.json().data.items[0].dishes[0].cooking_methods, ["蒸煮"]);
  assert.equal(placeResponse.json().data.items[0].dishes[0].taste, "鲜、香");
  assert.equal(placeResponse.json().data.items[0].preview_dishes[0].name, "牛肉面");

  const lightweightPlaceResponse = await app.inject({
    method: "GET",
    url: "/api/menu-places?place_type=outside&include_dishes=false",
    headers: authHeaders,
  });
  assert.equal(lightweightPlaceResponse.statusCode, 200);
  assert.equal(lightweightPlaceResponse.json().data.items[0].name, "街角面馆");
  assert.equal(lightweightPlaceResponse.json().data.items[0].dish_count, 0);
  assert.deepEqual(lightweightPlaceResponse.json().data.items[0].dishes, []);
  assert.deepEqual(lightweightPlaceResponse.json().data.items[0].preview_dishes, []);

  const dishResponse = await app.inject({
    method: "GET",
    url: `/api/dishes?place_id=${DINING_ID}&sort=custom`,
    headers: authHeaders,
  });
  assert.equal(dishResponse.statusCode, 200);
  assert.equal(dishResponse.json().data.items.length, 1);
  assert.equal(dishResponse.json().data.items[0].place_id, DINING_ID);
});

test("outside menu places can be reordered within their category", async (t) => {
  const supabase = createFakeSupabase({
    tables: authenticatedTables(),
    rpc: { reorder_menu_places: { data: null, error: null } },
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/api/menu-places/reorder",
    headers: authHeaders,
    payload: { ids: [SOURCE_ID, TARGET_ID] },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.updated, 2);
  assert.deepEqual(supabase.rpcCalls.at(-1), {
    name: "reorder_menu_places",
    params: {
      p_user_id: USER_ID,
      p_place_ids: [SOURCE_ID, TARGET_ID],
    },
  });
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

test("media records can request personal-rating priority", async (t) => {
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      media_entries: [{
        id: MEDIA_ID,
        title: "五星作品",
        media_type: "电影",
        watch_status: "completed",
        personal_rating: 5,
        platforms: [],
        sort_order: 1000,
      }],
    }),
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/media?sort=rating_desc",
    headers: authHeaders,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(supabase.orderCalls.slice(-2), [
    {
      table: "media_entries",
      field: "completed_personal_rating",
      options: { ascending: false, nullsFirst: false },
    },
    {
      table: "media_entries",
      field: "updated_at",
      options: { ascending: false },
    },
  ]);
});

test("media records can filter by an exact completed personal rating", async (t) => {
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      media_entries: [
        {
          id: MEDIA_ID,
          title: "五星作品",
          media_type: "电影",
          watch_status: "completed",
          personal_rating: 5,
          completed_personal_rating: 5,
          platforms: [],
          sort_order: 1000,
        },
        {
          id: TARGET_ID,
          title: "四星作品",
          media_type: "电影",
          watch_status: "completed",
          personal_rating: 4,
          completed_personal_rating: 4,
          platforms: [],
          sort_order: 2000,
        },
        {
          id: SOURCE_ID,
          title: "隐藏的五星",
          media_type: "电影",
          watch_status: "in_progress",
          personal_rating: 5,
          completed_personal_rating: null,
          platforms: [],
          sort_order: 3000,
        },
      ],
    }),
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/media?personal_rating=5&sort=rating_desc",
    headers: authHeaders,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.items.map((item) => item.id), [MEDIA_ID]);
  assert.equal(response.json().data.pagination.total, 1);

  const invalidResponse = await app.inject({
    method: "GET",
    url: "/api/media?personal_rating=0",
    headers: authHeaders,
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.json().error.code, "INVALID_INTEGER");
});

test("media list can include every category when media type is omitted", async (t) => {
  const entries = [
    {
      id: MEDIA_ID,
      user_id: USER_ID,
      title: "我的电影",
      media_type: "电影",
      watch_status: "completed",
      platforms: [],
      sort_order: 1000,
    },
    {
      id: TARGET_ID,
      user_id: USER_ID,
      title: "我的电视剧",
      media_type: "电视剧",
      watch_status: "in_progress",
      platforms: [],
      sort_order: 1000,
    },
  ];
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: entries }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/media?page_size=100",
    headers: authHeaders,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.pagination.total, 2);
  assert.deepEqual(
    new Set(response.json().data.items.map((item) => item.media_type)),
    new Set(["电影", "电视剧"]),
  );
});

test("personal modules never return another user's records", async (t) => {
  const ownMedia = {
    id: MEDIA_ID,
    user_id: USER_ID,
    title: "我的电影",
    media_type: "电影",
    watch_status: "completed",
    platforms: ["腾讯视频"],
    sort_order: 1000,
  };
  const otherMedia = {
    ...ownMedia,
    id: TARGET_ID,
    user_id: OTHER_USER_ID,
    title: "别人的电影",
    sort_order: 2000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: [ownMedia, otherMedia] }),
    }),
  });
  t.after(() => app.close());

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/media?media_type=%E7%94%B5%E5%BD%B1",
    headers: authHeaders,
  });
  assert.equal(listResponse.statusCode, 200);
  assert.deepEqual(listResponse.json().data.items, [ownMedia]);

  const detailResponse = await app.inject({
    method: "GET",
    url: `/api/media/${TARGET_ID}`,
    headers: authHeaders,
  });
  assert.equal(detailResponse.statusCode, 404);
  assert.equal(detailResponse.json().error.code, "RECORD_NOT_FOUND");
});

test("key moments list is user-scoped and filtered by Shanghai day", async (t) => {
  const ownMoment = {
    id: "30000000-0000-4000-8000-000000000001",
    user_id: USER_ID,
    content: "当天的节点",
    occurred_at: "2026-08-02T04:00:00.000Z",
    image_path: null,
    thumbnail_path: null,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        key_moments: [
          ownMoment,
          {
            ...ownMoment,
            id: "30000000-0000-4000-8000-000000000002",
            occurred_at: "2026-08-02T16:00:00.000Z",
          },
          {
            ...ownMoment,
            id: "30000000-0000-4000-8000-000000000003",
            user_id: OTHER_USER_ID,
          },
        ],
      }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "GET",
    url: "/api/key-moments?granularity=day&date=2026-08-02",
    headers: authHeaders,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.items, [
    { ...ownMoment, image_url: "", thumbnail_url: "" },
  ]);
});

test("key moments can be created without an image and run text safety checks", async (t) => {
  const checked = [];
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({ tables: authenticatedTables() }),
    contentSecurity: {
      async checkText(openId, content) {
        checked.push({ openId, content });
      },
      async checkImage() {},
    },
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/key-moments",
    headers: authHeaders,
    payload: {
      content: "完成关键节点模块",
      occurred_at: "2026-08-02T12:30:00+08:00",
    },
  });
  const body = response.json();
  assert.equal(response.statusCode, 201);
  assert.equal(body.data.item.content, "完成关键节点模块");
  assert.equal(body.data.item.user_id, USER_ID);
  assert.equal(body.data.item.occurred_at, "2026-08-02T04:30:00.000Z");
  assert.match(body.data.item.id, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(checked, [
    { openId: "test-openid", content: "完成关键节点模块" },
  ]);
});

test("key moment edits only check text when the content actually changes", async (t) => {
  const checked = [];
  const momentId = "30000000-0000-4000-8000-000000000010";
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        key_moments: [{
          id: momentId,
          user_id: USER_ID,
          content: "小猫",
          occurred_at: "2026-08-02T04:30:00.000Z",
          image_path: null,
          thumbnail_path: null,
        }],
      }),
    }),
    contentSecurity: {
      async checkText(openId, content) {
        checked.push({ openId, content });
      },
      async checkImage() {},
    },
  });
  t.after(() => app.close());

  const unchangedResponse = await app.inject({
    method: "PUT",
    url: `/api/key-moments/${momentId}`,
    headers: authHeaders,
    payload: {
      content: "小猫",
      occurred_at: "2026-08-02T05:00:00+08:00",
    },
  });
  assert.equal(unchangedResponse.statusCode, 200);
  assert.deepEqual(checked, []);

  const changedResponse = await app.inject({
    method: "PUT",
    url: `/api/key-moments/${momentId}`,
    headers: authHeaders,
    payload: {
      content: "小狗",
      occurred_at: "2026-08-02T05:00:00+08:00",
    },
  });
  assert.equal(changedResponse.statusCode, 200);
  assert.deepEqual(checked, [{ openId: "test-openid", content: "小狗" }]);
});

test("episodic media routes expose seasons, favorites, and episode updates", async (t) => {
  const episode = {
    id: EPISODE_ID,
    season_id: SEASON_ID,
    episode_number: 2,
    title: "重逢",
    plot_summary: "两人在车站重逢。",
    timeline_notes: [],
    is_favorite: true,
  };
  const season = {
    id: SEASON_ID,
    media_entry_id: MEDIA_ID,
    name: "第一季",
    cover_url: "https://example.com/season-one.webp",
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
    params: {
      p_user_id: USER_ID,
      p_media_entry_id: MEDIA_ID,
      p_name: "第二季",
      p_episode_count: 12,
    },
  });

  const setCoverResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}/cover`,
    headers: authHeaders,
    payload: { season_id: SEASON_ID },
  });
  assert.equal(setCoverResponse.statusCode, 200);
  assert.equal(
    setCoverResponse.json().data.item.cover_url,
    "https://example.com/season-one.webp",
  );

  const updateEpisodeResponse = await app.inject({
    method: "PUT",
    url: `/api/media-episodes/${EPISODE_ID}`,
    headers: authHeaders,
    payload: {
      plot_summary: "更新后的剧情",
      timeline_notes: [
        {
          id: "note-later",
          timecode: "01:03:09",
          type: "key",
          content: "发现关键线索",
          dialogues: [],
        },
        {
          id: "note-quote",
          timecode: "00:30:00",
          type: "quote",
          content: "不会被保存的摘要",
          dialogues: [
            { id: "line-one", speaker: "费渡", content: "你是不是觉得我特别无情？" },
            { id: "line-two", speaker: "骆闻舟", content: "我觉得你特别能装。" },
          ],
        },
        { id: "note-earlier", timecode: "00:12:30", content: "两人在车站见面" },
      ],
    },
  });
  assert.equal(updateEpisodeResponse.statusCode, 200);
  assert.equal(updateEpisodeResponse.json().data.item.is_favorite, true);
  assert.equal(updateEpisodeResponse.json().data.item.plot_summary, "更新后的剧情");
  assert.deepEqual(updateEpisodeResponse.json().data.item.timeline_notes, [
    {
      id: "note-earlier",
      timecode: "00:12:30",
      type: "normal",
      content: "两人在车站见面",
      dialogues: [],
    },
    {
      id: "note-quote",
      timecode: "00:30:00",
      type: "quote",
      content: "",
      dialogues: [
        { id: "line-one", speaker: "费渡", content: "你是不是觉得我特别无情？" },
        { id: "line-two", speaker: "骆闻舟", content: "我觉得你特别能装。" },
      ],
    },
    {
      id: "note-later",
      timecode: "01:03:09",
      type: "key",
      content: "发现关键线索",
      dialogues: [],
    },
  ]);

  const invalidTimecodeResponse = await app.inject({
    method: "PUT",
    url: `/api/media-episodes/${EPISODE_ID}`,
    headers: authHeaders,
    payload: {
      timeline_notes: [{ id: "bad-time", timecode: "1:70:00", content: "无效时间" }],
    },
  });
  assert.equal(invalidTimecodeResponse.statusCode, 400);
  assert.equal(invalidTimecodeResponse.json().error.code, "INVALID_TIMECODE");

  const invalidQuoteResponse = await app.inject({
    method: "PUT",
    url: `/api/media-episodes/${EPISODE_ID}`,
    headers: authHeaders,
    payload: {
      timeline_notes: [{
        id: "bad-quote",
        timecode: "00:20:00",
        type: "quote",
        content: "",
        dialogues: [{ id: "empty-speaker", speaker: "", content: "没有说话人" }],
      }],
    },
  });
  assert.equal(invalidQuoteResponse.statusCode, 400);
  assert.equal(invalidQuoteResponse.json().error.code, "TEXT_REQUIRED");
});

test("media cover upload stores a WebP image and updates the existing entry", async (t) => {
  const media = {
    id: MEDIA_ID,
    title: "测试电影",
    media_type: "电影",
    watch_status: "completed",
    platforms: ["腾讯视频"],
    cover_url: "https://example.com/legacy-cover.webp",
  };
  const checkedImages = [];
  const supabase = createFakeSupabase({
    tables: authenticatedTables({ media_entries: [media] }),
  });
  const app = buildServer({
    logger: false,
    supabase,
    contentSecurity: {
      async checkText() {},
      async checkImage(image) {
        checkedImages.push(image);
      },
    },
  });
  t.after(() => app.close());

  const sourceImage = await sharp({
    create: {
      width: 300,
      height: 400,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  }).png().toBuffer();
  const boundary = "media-cover-test-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="cover.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    sourceImage,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await app.inject({
    method: "POST",
    url: `/api/media/${MEDIA_ID}/image`,
    headers: {
      ...authHeaders,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(checkedImages.length, 1);
  assert.equal(supabase.storageUploads.length, 2);
  const upload = supabase.storageUploads.find(({ path }) => !path.includes("-thumbnail.webp"));
  const thumbnailUpload = supabase.storageUploads.find(({ path }) => path.includes("-thumbnail.webp"));
  assert.ok(upload);
  assert.ok(thumbnailUpload);
  assert.equal(upload.bucket, "media-covers");
  assert.match(upload.path, new RegExp(`^users/${USER_ID}/entries/${MEDIA_ID}/.+\\.webp$`));
  assert.equal(upload.options.contentType, "image/webp");
  assert.deepEqual(
    await sharp(upload.buffer).metadata().then(({ format, width, height }) => ({
      format,
      width,
      height,
    })),
    { format: "webp", width: 300, height: 400 },
  );
  assert.deepEqual(
    await sharp(thumbnailUpload.buffer).metadata().then(({ format, width, height }) => ({
      format,
      width,
      height,
    })),
    { format: "webp", width: 240, height: 320 },
  );
  assert.equal(response.json().data.item.cover_url.includes(upload.path), true);
});

test("activity cards expose introductions and replace optimized 4:3 covers", async (t) => {
  const activity = {
    id: SOURCE_ID,
    user_id: USER_ID,
    name: "环湖骑行",
    introduction: "沿着湖岸慢慢骑。",
    activity_type: "户外",
    image_path: "users/old/activity.webp",
    thumbnail_path: "users/old/activity-thumbnail.webp",
    sort_order: 1000,
  };
  const homeActivity = {
    ...activity,
    id: TARGET_ID,
    name: "看电影",
    introduction: "选一部喜欢的电影放松一下。",
    activity_type: "居家",
  };
  const checkedImages = [];
  const supabase = createFakeSupabase({
    tables: authenticatedTables({ activity_items: [activity, homeActivity] }),
  });
  const app = buildServer({
    logger: false,
    supabase,
    contentSecurity: {
      async checkText() {},
      async checkImage(image) {
        checkedImages.push(image);
      },
    },
  });
  t.after(() => app.close());

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/activities?activity_type=%E6%88%B7%E5%A4%96",
    headers: authHeaders,
  });
  assert.equal(listResponse.statusCode, 200);
  assert.equal(listResponse.json().data.items[0].introduction, "沿着湖岸慢慢骑。");
  assert.equal(
    listResponse.json().data.items[0].thumbnail_url,
    "https://example.test/activity-images/users/old/activity-thumbnail.webp",
  );

  const allTypesResponse = await app.inject({
    method: "GET",
    url: "/api/activities?all_types=true",
    headers: authHeaders,
  });
  assert.equal(allTypesResponse.statusCode, 200);
  assert.deepEqual(
    allTypesResponse.json().data.items.map((item) => item.activity_type).sort(),
    ["居家", "户外"],
  );
  assert.equal(
    allTypesResponse.json().data.items.find((item) => item.id === TARGET_ID).introduction,
    "选一部喜欢的电影放松一下",
  );

  const longIntroductionResponse = await app.inject({
    method: "PUT",
    url: `/api/activities/${SOURCE_ID}`,
    headers: authHeaders,
    payload: {
      name: "环湖骑行",
      introduction: "迎着风出发，沿湖完成骑行。",
      activity_type: "户外",
    },
  });
  assert.equal(longIntroductionResponse.statusCode, 400);
  assert.equal(longIntroductionResponse.json().error.code, "TEXT_TOO_LONG");

  const updateResponse = await app.inject({
    method: "PUT",
    url: `/api/activities/${SOURCE_ID}`,
    headers: authHeaders,
    payload: {
      name: "环湖骑行",
      introduction: "迎着风出发，去环湖骑行。",
      activity_type: "户外",
    },
  });
  assert.equal(updateResponse.statusCode, 200);
  assert.equal(
    updateResponse.json().data.item.introduction,
    "迎着风出发，去环湖骑行。",
  );

  const sourceImage = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 80, g: 130, b: 170 },
    },
  }).png().toBuffer();
  const boundary = "activity-cover-test-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="activity.png"\r\nContent-Type: image/png\r\n\r\n`,
    ),
    sourceImage,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const imageResponse = await app.inject({
    method: "POST",
    url: `/api/activities/${SOURCE_ID}/image`,
    headers: {
      ...authHeaders,
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
    payload,
  });

  assert.equal(imageResponse.statusCode, 200);
  assert.equal(checkedImages.length, 1);
  assert.equal(supabase.storageUploads.length, 2);
  const upload = supabase.storageUploads.find(({ path }) => !path.includes("-thumbnail.webp"));
  const thumbnailUpload = supabase.storageUploads.find(({ path }) => path.includes("-thumbnail.webp"));
  assert.ok(upload);
  assert.ok(thumbnailUpload);
  assert.equal(upload.bucket, "activity-images");
  assert.match(upload.path, new RegExp(`^users/${USER_ID}/activities/${SOURCE_ID}/.+\\.webp$`));
  assert.deepEqual(
    await sharp(thumbnailUpload.buffer).metadata().then(({ format, width, height }) => ({
      format,
      width,
      height,
    })),
    { format: "webp", width: 720, height: 540 },
  );
  assert.deepEqual(supabase.storageRemovals[0], {
    bucket: "activity-images",
    paths: ["users/old/activity.webp", "users/old/activity-thumbnail.webp"],
  });
  assert.equal(imageResponse.json().data.item.image_url.includes(upload.path), true);
});

test("activity card migration preserves existing rows and adds optional covers", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608090002_activity_cards.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /add column if not exists introduction text/i);
  assert.match(migration, /set introduction = ''[\s\S]*where introduction is null/i);
  assert.match(migration, /add column if not exists image_path text/i);
  assert.match(migration, /add column if not exists thumbnail_path text/i);
  assert.match(migration, /'activity-images',[\s\S]*?true,/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.activity_items/i);
  assert.doesNotMatch(migration, /drop\s+table\s+public\.activity_items/i);
});

test("activity introduction backfill only fills blank matching activities", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608090003_activity_introductions.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /with generated_introductions\(activity_type, name, introduction\)/i);
  assert.match(migration, /红花湖骑行一圈/);
  assert.match(migration, /拳击/);
  assert.match(migration, /btrim\(coalesce\(item\.introduction, ''\)\) = ''/i);
  assert.doesNotMatch(migration, /delete\s+from|drop\s+table|drop\s+column/i);
});

test("activity introduction shortening preserves custom copy and stays within 12 characters", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608090004_shorten_activity_introductions.sql", import.meta.url),
    "utf8",
  );
  const mappings = [...migration.matchAll(/\('([^']+)',\s*'([^']+)',\s*'([a-f0-9]{32})',\s*'([^']+)'\)/g)];
  assert.equal(mappings.length, 20);
  for (const [, , name, , introduction] of mappings) {
    assert.ok(Array.from(introduction).length <= 12, `${name} introduction must be at most 12 characters`);
  }
  assert.match(migration, /md5\(btrim\(coalesce\(item\.introduction, ''\)\)\)\s*=\s*shortened\.previous_introduction_md5/i);
  assert.match(migration, /char_length\(shortened\.introduction\)\s*<=\s*12/i);
  assert.doesNotMatch(migration, /delete\s+from|drop\s+table|drop\s+column/i);
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

test("luggage reorder accepts one final snapshot and applies only the required moves", async (t) => {
  const sceneId = DINING_ID;
  const firstGroupId = SOURCE_ID;
  const secondGroupId = TARGET_ID;
  const firstItemId = SEASON_ID;
  const secondItemId = EPISODE_ID;
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      luggage_scenes: [{ id: sceneId, name: "周末出行", sort_order: 1000 }],
      luggage_groups: [
        { id: firstGroupId, scene_id: sceneId, name: "必备物品", is_required: true, sort_order: 1000 },
        { id: secondGroupId, scene_id: sceneId, name: "更加舒适", is_required: false, sort_order: 2000 },
      ],
      luggage_items: [
        { id: firstItemId, group_id: firstGroupId, name: "身份证", sort_order: 1000 },
        { id: secondItemId, group_id: firstGroupId, name: "充电器", sort_order: 2000 },
      ],
    }),
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/api/luggage/order",
    headers: authHeaders,
    payload: {
      scene_id: sceneId,
      group_ids: [secondGroupId, firstGroupId],
      item_ids_by_group: {
        [firstGroupId]: [secondItemId, firstItemId],
        [secondGroupId]: [],
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, data: { updated: 2 } });
  assert.deepEqual(supabase.rpcCalls, [
    {
      name: "move_luggage_group",
      params: {
        p_user_id: USER_ID,
        p_source_id: secondGroupId,
        p_target_id: firstGroupId,
        p_insert_after: false,
      },
    },
    {
      name: "move_luggage_item",
      params: {
        p_user_id: USER_ID,
        p_source_id: secondItemId,
        p_target_group_id: firstGroupId,
        p_target_item_id: firstItemId,
        p_insert_after: false,
      },
    },
  ]);
});

test("luggage scene order is saved from one final ordered id list", async (t) => {
  const firstSceneId = DINING_ID;
  const secondSceneId = SOURCE_ID;
  const supabase = createFakeSupabase({
    tables: authenticatedTables({
      luggage_scenes: [
        { id: firstSceneId, name: "周末出行", sort_order: 1000 },
        { id: secondSceneId, name: "长期旅行", sort_order: 2000 },
      ],
    }),
  });
  const app = buildServer({ logger: false, supabase });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: "/api/luggage/scenes/order",
    headers: authHeaders,
    payload: { scene_ids: [secondSceneId, firstSceneId] },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, data: { updated: 2 } });

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/luggage",
    headers: authHeaders,
  });
  const savedOrderById = new Map(
    listResponse.json().data.items.map((scene) => [scene.id, scene.sort_order]),
  );
  assert.equal(savedOrderById.get(secondSceneId), 1000);
  assert.equal(savedOrderById.get(firstSceneId), 2000);
});

test("media writes accept an omitted platform and validate selected platforms before the create RPC", async (t) => {
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

  const pendingResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "旧待定平台条目",
      media_type: "电影",
      platforms: ["待定"],
    },
  });
  assert.equal(pendingResponse.statusCode, 400);
  assert.equal(pendingResponse.json().error.code, "INVALID_MEDIA_PLATFORM");
  assert.equal(supabase.rpcCalls.length, 0);

  const plannedRatingResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "想看但未评分的作品",
      media_type: "电影",
      watch_status: "planned",
      personal_rating: 5,
    },
  });
  assert.equal(plannedRatingResponse.statusCode, 400);
  assert.equal(plannedRatingResponse.json().error.code, "RATING_REQUIRES_COMPLETED");
  assert.equal(supabase.rpcCalls.length, 0);

  const duplicateResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: " 千与千寻 ",
      media_type: "电影",
    },
  });
  assert.equal(duplicateResponse.statusCode, 409);
  assert.equal(duplicateResponse.json().error.code, "MEDIA_TITLE_EXISTS");
  assert.equal(supabase.rpcCalls.length, 0);

  const emptyResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "未填写平台条目",
      media_type: "电影",
    },
  });
  assert.equal(emptyResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls[0].params.p_platforms, []);

  const validResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "合法平台条目",
      media_type: "电影",
      platforms: ["猫耳", "猫耳", "漫播", "Books"],
    },
  });
  assert.equal(validResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls[1], {
    name: "create_media_entry_at_end",
    params: {
      p_user_id: USER_ID,
      p_title: "合法平台条目",
      p_media_type: "电影",
      p_watch_status: "completed",
      p_platforms: ["猫耳", "漫播", "Books"],
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
      platforms: [],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(supabase.rpcCalls, [
    {
      name: "move_media_entry_to_type_at_end",
      params: {
        p_user_id: USER_ID,
        p_entry_id: MEDIA_ID,
        p_title: "新标题",
        p_media_type: "动漫",
        p_watch_status: null,
        p_platforms: [],
      },
    },
  ]);
  assert.deepEqual(response.json().data.item, {
    id: MEDIA_ID,
    title: "新标题",
    media_type: "动漫",
    watch_status: "planned",
    platforms: [],
    sort_order: 2000,
  });
});

test("new completed media defaults its required rating to three", async (t) => {
  const placeholder = {
    id: MEDIA_ID,
    title: "待创建占位",
    media_type: "占位分类",
    watch_status: "planned",
    platforms: [],
    personal_rating: null,
    is_revisitable: false,
    sort_order: 1000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: [placeholder] }),
      rpc: {
        create_media_entry_at_end: (params) => ({
          data: { id: MEDIA_ID, ...params },
          error: null,
        }),
      },
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: { title: "默认三星作品", media_type: "电影" },
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.json().data.item.personal_rating, 3);
  assert.equal(response.json().data.item.is_revisitable, false);

  const missingResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "显式清空评分",
      media_type: "电影",
      personal_rating: null,
    },
  });
  assert.equal(missingResponse.statusCode, 400);
  assert.equal(missingResponse.json().error.code, "RATING_REQUIRED");

  const legacyResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "旧版未标记作品",
      media_type: "电影",
      is_revisitable: false,
    },
  });
  assert.equal(legacyResponse.statusCode, 201);
  assert.equal(legacyResponse.json().data.item.personal_rating, 3);
});

test("completed media ratings are required, validate one to five, and sync legacy revisit state", async (t) => {
  const existing = {
    id: MEDIA_ID,
    title: "评分测试",
    media_type: "电影",
    watch_status: "completed",
    platforms: [],
    personal_rating: null,
    is_revisitable: false,
    sort_order: 1000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: [existing] }),
    }),
  });
  t.after(() => app.close());

  const fiveStarResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: 5 },
  });
  assert.equal(fiveStarResponse.statusCode, 200);
  assert.equal(fiveStarResponse.json().data.item.personal_rating, 5);
  assert.equal(fiveStarResponse.json().data.item.is_revisitable, true);

  const clearResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: null },
  });
  assert.equal(clearResponse.statusCode, 400);
  assert.equal(clearResponse.json().error.code, "RATING_REQUIRED");

  const legacyResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { is_revisitable: true },
  });
  assert.equal(legacyResponse.statusCode, 200);
  assert.equal(legacyResponse.json().data.item.personal_rating, 5);
  assert.equal(legacyResponse.json().data.item.is_revisitable, true);

  const invalidResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: 6 },
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.json().error.code, "INVALID_INTEGER");

  const twoStarResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: 2 },
  });
  assert.equal(twoStarResponse.statusCode, 200);
  assert.equal(twoStarResponse.json().data.item.personal_rating, 2);

  const belowMinimumResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: 0 },
  });
  assert.equal(belowMinimumResponse.statusCode, 400);
  assert.equal(belowMinimumResponse.json().error.code, "INVALID_INTEGER");

  const inProgressResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { watch_status: "in_progress" },
  });
  assert.equal(inProgressResponse.statusCode, 200);
  assert.equal(inProgressResponse.json().data.item.watch_status, "in_progress");
  assert.equal(inProgressResponse.json().data.item.personal_rating, 2);

  const inProgressRatingResponse = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { personal_rating: 4 },
  });
  assert.equal(inProgressRatingResponse.statusCode, 400);
  assert.equal(inProgressRatingResponse.json().error.code, "RATING_REQUIRES_COMPLETED");
});

test("changing an unscored work to completed defaults its required rating to three", async (t) => {
  const existing = {
    id: MEDIA_ID,
    title: "待完成作品",
    media_type: "电影",
    watch_status: "in_progress",
    platforms: [],
    personal_rating: null,
    is_revisitable: false,
    sort_order: 1000,
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ media_entries: [existing] }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/media/${MEDIA_ID}`,
    headers: authHeaders,
    payload: { watch_status: "completed" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.item.watch_status, "completed");
  assert.equal(response.json().data.item.personal_rating, 3);
  assert.equal(response.json().data.item.is_revisitable, false);
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
    params: {
      p_user_id: USER_ID,
      p_source_id: SOURCE_ID,
      p_target_id: TARGET_ID,
    },
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

test("dish meal periods accept free combinations and reject invalid values", async (t) => {
  const dish = {
    id: SOURCE_ID,
    user_id: USER_ID,
    name: "番茄炒鸡蛋",
    category_id: TARGET_ID,
    categories: { id: TARGET_ID, name: "半荤" },
    image_path: "dish.png",
    thumbnail_path: "dish-thumb.webp",
    meal_periods: ["lunch", "dinner"],
    printed_at: null,
    sort_order: 1000,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ dishes: [dish] }),
    }),
  });
  t.after(() => app.close());

  const validResponse = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: { meal_periods: ["breakfast", "lunch", "afternoon_tea", "dinner"] },
  });
  assert.equal(validResponse.statusCode, 200);
  assert.deepEqual(validResponse.json().data.dish.meal_periods, [
    "breakfast",
    "lunch",
    "afternoon_tea",
    "dinner",
  ]);

  const invalidResponse = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: { meal_periods: ["breakfast", "brunch"] },
  });
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(invalidResponse.json().error.code, "INVALID_MEAL_PERIODS");
});

test("dish meal-period migration defaults existing dishes to lunch and dinner", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202607300001_dish_meal_periods.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /default array\['lunch', 'dinner'\]::text\[\]/i);
  assert.match(migration, /cardinality\(meal_periods\) between 1 and 3/i);
  assert.match(migration, /p_meal_periods text\[\]/i);
});

test("home dish details accept ingredients, introduction, methods, taste, and flavor options", async (t) => {
  const dish = {
    id: SOURCE_ID,
    user_id: USER_ID,
    name: "炒虾",
    record_type: "home",
    category_id: TARGET_ID,
    outside_category_id: null,
    categories: { id: TARGET_ID, name: "荤菜" },
    recommended_items: [],
    main_ingredients: [],
    introduction: "",
    cooking_methods: [],
    taste: [],
    flavor_options: [],
    image_path: "dish.png",
    thumbnail_path: "dish-thumb.webp",
    meal_periods: ["lunch", "dinner"],
    printed_at: null,
    sort_order: 1000,
    created_at: "2026-08-04T00:00:00.000Z",
    updated_at: "2026-08-04T00:00:00.000Z",
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({ dishes: [dish] }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: {
      main_ingredients: ["虾", "蒜"],
      introduction: "同一道炒虾可以更换香草风味。",
      cooking_methods: ["煎炒", "即食"],
      taste: "香、鲜",
      flavor_options: ["紫苏", "九层塔", "紫苏"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.dish.main_ingredients, ["虾", "蒜"]);
  assert.equal(response.json().data.dish.introduction, "同一道炒虾可以更换香草风味。");
  assert.deepEqual(response.json().data.dish.cooking_methods, ["煎炒", "即食"]);
  assert.equal(response.json().data.dish.taste, "鲜、香");
  assert.deepEqual(response.json().data.dish.flavor_options, ["紫苏", "九层塔"]);
  assert.deepEqual(dish.cooking_methods, ["cooking_01", "cooking_05"]);
  assert.deepEqual(dish.taste, ["taste_03", "taste_04"]);

  const invalidTasteResponse = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: { taste: "香辣" },
  });
  assert.equal(invalidTasteResponse.statusCode, 400);
  assert.equal(invalidTasteResponse.json().error.code, "INVALID_TASTE");

  const invalidCookingResponse = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: { cooking_methods: ["炒"] },
  });
  assert.equal(invalidCookingResponse.statusCode, 400);
  assert.equal(invalidCookingResponse.json().error.code, "INVALID_COOKING_METHODS");
});

test("home dish detail migration preserves historical rows with empty defaults", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608040002_dish_home_details.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /add column if not exists main_ingredients text\[\]/i);
  assert.match(migration, /introduction = coalesce\(introduction, ''\)/i);
  assert.match(migration, /flavor_options = coalesce\(flavor_options, '\{\}'\)/i);
  assert.match(migration, /p_flavor_options text\[\]/i);
  assert.match(
    migration,
    /create function public\.create_dish_at_end\([\s\S]*p_recommended_items text\[\][\s\S]*language sql/i,
  );
});

test("dish taste migration stores only exact standard labels", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608040005_standardize_dish_taste.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /无法精确匹配的历史口味/);
  assert.match(migration, /is_standard_dish_taste/);
  assert.match(migration, /array\['清淡', '咸', '鲜', '香', '酸', '甜', '辣'\]/);
  assert.doesNotMatch(migration, /like|position\s*\(/i);
});

test("menu attribute code migration decouples stored values from display labels", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608040006_menu_attribute_codes.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /when '煎炒' then 'cooking_01'/);
  assert.match(migration, /when '香' then 'taste_04'/);
  assert.match(migration, /alter column taste type text\[\]/i);
  assert.match(migration, /is_standard_menu_codes/);
  assert.match(migration, /p_taste text\[\]/);
  assert.doesNotMatch(migration, /drop column|drop table|delete from public\.dishes/i);
});

test("afternoon tea and ready-to-eat migration widens enums without rewriting rows", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608050003_afternoon_tea_and_ready_to_eat.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /'breakfast', 'lunch', 'afternoon_tea', 'dinner'/);
  assert.match(migration, /cardinality\(meal_periods\) between 1 and 4/i);
  assert.match(migration, /'cooking_04', 'cooking_05'/);
  assert.match(migration, /pg_get_functiondef/);
  assert.doesNotMatch(migration, /update public\.dishes|delete from|drop table|drop column/i);
});

test("menu place migration preserves legacy stores and backfills real dishes", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608040004_menu_places_and_dishes.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /create table if not exists public\.menu_places/i);
  assert.match(migration, /add column if not exists place_id uuid/i);
  assert.match(migration, /'家里'[\s\S]*'home'/i);
  assert.match(migration, /from public\.dishes as legacy[\s\S]*legacy\.record_type = 'outside'/i);
  assert.match(migration, /cross join lateral unnest\(legacy\.recommended_items\)/i);
  assert.match(migration, /legacy\.place_id is null/i);
  assert.match(migration, /create or replace function public\.create_menu_dish/i);
  assert.match(migration, /create or replace function public\.sync_menu_place_from_legacy_dish/i);
  assert.doesNotMatch(migration, /drop table public\.dishes/i);
  assert.doesNotMatch(migration, /delete from public\.dishes/i);
});

test("menu place creation trigger uses array defaults after taste code migration", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608050002_fix_menu_place_creation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /create or replace function public\.sync_menu_place_from_legacy_dish/i);
  assert.match(
    migration,
    /new\.outside_category_id,[\s\S]*?'\{\}',\s*'\{\}',\s*'',\s*'\{\}',\s*'\{\}',\s*'\{\}'/i,
  );
  assert.doesNotMatch(migration, /drop table|drop column|delete from public\.dishes/i);
});

test("legacy outside-store creation sends an empty taste array", async () => {
  const dishLogic = await readFile(
    new URL("../domains/menu/dishes.mjs", import.meta.url),
    "utf8",
  );
  const placeLogic = await readFile(
    new URL("../domains/menu/places.mjs", import.meta.url),
    "utf8",
  );

  assert.match(
    dishLogic,
    /const taste = place \|\| recordType === "home" \? normalizeTaste\(fields\.taste, true\) : \[\];/,
  );
  assert.match(placeLogic, /taste: "\[\]"/);
  assert.doesNotMatch(placeLogic, /taste: "",/);
});

test("dish ordering migration backfills newest-first and inserts new dishes first", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202608040003_dishes_newest_first.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /partition by user_id[\s\S]*order by created_at desc, id desc/i);
  assert.match(migration, /set constraints dishes_user_sort_order_unique deferred/i);
  assert.match(
    migration,
    /select coalesce\(min\(sort_order\) - 1000, 1000\)[\s\S]*where user_id = new\.user_id/i,
  );
  assert.match(migration, /before insert on public\.dishes/i);
  assert.match(migration, /hashtextextended\('dishes:' \|\| new\.user_id::text, 0\)/i);
});

test("menu records can switch from a home dish to an outside store", async (t) => {
  const dish = {
    id: SOURCE_ID,
    user_id: USER_ID,
    name: "番茄炒鸡蛋",
    record_type: "home",
    category_id: TARGET_ID,
    categories: { id: TARGET_ID, name: "半荤" },
    recommended_items: [],
    main_ingredients: ["番茄", "鸡蛋"],
    introduction: "家常快手菜。",
    cooking_methods: ["cooking_01"],
    taste: ["taste_05", "taste_06"],
    flavor_options: ["少糖"],
    image_path: "dish.png",
    thumbnail_path: "dish-thumb.webp",
    meal_periods: ["lunch", "dinner"],
    printed_at: null,
    sort_order: 1000,
    created_at: "2026-07-30T00:00:00.000Z",
    updated_at: "2026-07-30T00:00:00.000Z",
  };
  const app = buildServer({
    logger: false,
    supabase: createFakeSupabase({
      tables: authenticatedTables({
        dishes: [dish],
        categories: [{ id: TARGET_ID, user_id: USER_ID, name: "半荤" }],
        dining_scenes: [{ id: DINING_ID, user_id: USER_ID, name: "日常" }],
      }),
    }),
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: {
      name: "海底捞",
      record_type: "outside",
      category_id: null,
      outside_category_id: DINING_ID,
      recommended_items: ["番茄锅", "虾滑"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().data.dish.name, "海底捞");
  assert.equal(response.json().data.dish.record_type, "outside");
  assert.equal(response.json().data.dish.category_id, null);
  assert.equal(response.json().data.dish.outside_category_id, DINING_ID);
  assert.deepEqual(response.json().data.dish.recommended_items, ["番茄锅", "虾滑"]);
  assert.deepEqual(response.json().data.dish.main_ingredients, ["番茄", "鸡蛋"]);
  assert.equal(response.json().data.dish.introduction, "家常快手菜。");
  assert.deepEqual(response.json().data.dish.cooking_methods, ["煎炒"]);
  assert.equal(response.json().data.dish.taste, "酸、甜");
  assert.deepEqual(response.json().data.dish.flavor_options, ["少糖"]);
});

test("unified menu migration preserves stores as outside records", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202607300002_unified_menu_records.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /record_type in \('home', 'outside'\)/i);
  assert.match(migration, /from public\.dining_places as place/i);
  assert.match(migration, /outside_record\.menu_items/i);
  assert.match(migration, /source_dining_place_id/i);
});

test("outside menu category migration keeps each store in its previous scene", async () => {
  const migration = await readFile(
    new URL(
      "../../supabase/migrations/202607300003_outside_menu_categories.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /set outside_category_id = place\.scene_id/i);
  assert.match(migration, /references public\.dining_scenes\(id, user_id\)/i);
  assert.match(migration, /p_outside_category_id uuid/i);
});

test("required media-platform migration backfills pending sources and rejects empty arrays", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607130001_required_media_platforms.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set platforms = array\['待定'\]/);
  assert.match(migration, /cardinality\(platforms\) > 0/);
  assert.match(migration, /'待定'.*'猫耳'.*'漫播'/s);
  assert.match(migration, /not \('待定' = any\(platforms\)\).*cardinality\(platforms\) = 1/s);
});

test("Books media-platform migration updates novel sources and keeps the platform valid", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607140002_books_media_platform.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set platforms = array\['Books'\]::text\[\]/);
  assert.match(migration, /where media_type = '小说'/);
  assert.match(migration, /'待定'.*'猫耳'.*'漫播'.*'Books'/s);
});

test("optional media-platform migration converts pending sources to empty arrays", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608080001_optional_media_platforms.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set platforms = array\[\]::text\[\]/i);
  assert.match(migration, /where platforms = array\['待定'\]::text\[\]/i);
  assert.match(migration, /alter column platforms set default array\[\]::text\[\]/i);
  assert.doesNotMatch(migration, /cardinality\(platforms\) > 0/i);
  assert.equal(migration.match(/'待定'/g)?.length, 1);
  assert.match(migration, /'腾讯视频'.*'猫耳'.*'漫播'.*'Books'/s);
});

test("personal-rating migration preserves unmarked records and upgrades revisit marks to four stars", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608080002_media_personal_ratings.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /add column if not exists personal_rating smallint/i);
  assert.match(migration, /set personal_rating = 4[\s\S]*where is_revisitable is true/i);
  assert.match(migration, /personal_rating is null or personal_rating between 1 and 5/i);
  assert.match(migration, /create or replace function public\.sync_media_personal_rating/i);
  assert.match(migration, /new\.personal_rating := case when new\.is_revisitable then 4 else null end/i);
  assert.match(migration, /before insert or update of personal_rating, is_revisitable/i);
  assert.match(migration, /personal_rating desc nulls last[\s\S]*updated_at desc/i);
  assert.doesNotMatch(migration, /where is_revisitable is false/i);
  assert.doesNotMatch(migration, /drop column.*is_revisitable/i);
});

test("revisit-rating upgrade moves historical four-star marks to five stars", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608080003_media_revisit_ratings_to_five.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set personal_rating = 5[\s\S]*where personal_rating = 4/i);
  assert.match(migration, /new\.personal_rating := 5/i);
  assert.match(migration, /new\.personal_rating := case when new\.is_revisitable then 5 else null end/i);
  assert.doesNotMatch(migration, /where personal_rating is null/i);
});

test("completed-rating sort migration hides non-completed scores without deleting them", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608080004_media_completed_rating_sort.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /add column if not exists completed_personal_rating smallint/i);
  assert.match(migration, /generated always as/i);
  assert.match(migration, /case when watch_status = 'completed' then personal_rating else null end/i);
  assert.match(migration, /completed_personal_rating desc nulls last[\s\S]*updated_at desc/i);
  assert.doesNotMatch(migration, /update public\.media_entries[\s\S]*set personal_rating = null/i);
  assert.doesNotMatch(migration, /delete from public\.media_entries/i);
});

test("required-rating migration preserves scores and defaults only missing completed ratings", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202608090001_required_media_ratings.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /set personal_rating = 3[\s\S]*watch_status = 'completed'[\s\S]*personal_rating is null/i);
  assert.doesNotMatch(migration, /personal_rating < 3/i);
  assert.match(migration, /personal_rating is null or personal_rating between 1 and 5/i);
  assert.match(migration, /watch_status <> 'completed' or personal_rating is not null/i);
  assert.match(migration, /new\.watch_status = 'completed'[\s\S]*new\.personal_rating := 3/i);
  assert.match(migration, /update of personal_rating, is_revisitable, watch_status/i);
  assert.doesNotMatch(migration, /delete from|drop table|drop column/i);
});

test("episode timeline migration stores arrays and includes notes in favorite search", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607130002_media_episode_timeline_notes.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /timeline_notes jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /jsonb_typeof\(timeline_notes\) = 'array'/i);
  assert.match(migration, /jsonb_array_elements\(episode\.timeline_notes\)/i);
  assert.match(migration, /note ->> 'content' ilike/i);
});

test("timeline note type migration includes quote speakers and dialogue in favorite search", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607140001_media_timeline_note_types.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /jsonb_typeof\(note -> 'dialogues'\) = 'array'/i);
  assert.match(migration, /dialogue ->> 'speaker' ilike/i);
  assert.match(migration, /dialogue ->> 'content' ilike/i);
});

test("animation movies are included in episodic media creation", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607130003_animation_movies_episodic.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    migration,
    /array\['电视剧', '动漫', '动画', '动画片', '广播剧'\]::text\[\]/,
  );
  assert.match(migration, /create_media_season_with_episodes/);
});

test("sort-order migration declares atomic create and deferrable swap contracts", async () => {
  const migration = await readFile(
    new URL("../../supabase/migrations/202607110007_sort_order_integrity.sql", import.meta.url),
    "utf8",
  );
  const hardeningMigration = await readFile(
    new URL("../../supabase/migrations/202607110008_auth_and_sort_concurrency.sql", import.meta.url),
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

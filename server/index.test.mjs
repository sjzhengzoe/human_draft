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
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000009";

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

    lt(field, value) {
      this.rows = this.rows.filter((row) => row[field] < value);
      return this;
    }

    order() {
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
    storage: {
      from(bucket) {
        return {
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
    main_ingredients: [],
    introduction: "",
    cooking_methods: [],
    taste: "",
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
  assert.equal(placeResponse.json().data.items[0].preview_dishes[0].name, "牛肉面");

  const dishResponse = await app.inject({
    method: "GET",
    url: `/api/dishes?place_id=${DINING_ID}&sort=custom`,
    headers: authHeaders,
  });
  assert.equal(dishResponse.statusCode, 200);
  assert.equal(dishResponse.json().data.items.length, 1);
  assert.equal(dishResponse.json().data.items[0].place_id, DINING_ID);
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

  const emptyResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "缺少平台条目",
      media_type: "电影",
      platforms: [],
    },
  });
  assert.equal(emptyResponse.statusCode, 400);
  assert.equal(emptyResponse.json().error.code, "MEDIA_PLATFORM_REQUIRED");
  assert.equal(supabase.rpcCalls.length, 0);

  const mixedPendingResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "矛盾平台条目",
      media_type: "电影",
      platforms: ["待定", "腾讯视频"],
    },
  });
  assert.equal(mixedPendingResponse.statusCode, 400);
  assert.equal(mixedPendingResponse.json().error.code, "INVALID_MEDIA_PLATFORM_SELECTION");
  assert.equal(supabase.rpcCalls.length, 0);

  const duplicateResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: " 千与千寻 ",
      media_type: "电影",
      platforms: ["待定"],
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
      platforms: ["猫耳", "猫耳", "漫播", "Books"],
    },
  });
  assert.equal(validResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls[0], {
    name: "create_media_entry_at_end",
    params: {
      p_user_id: USER_ID,
      p_title: "合法平台条目",
      p_media_type: "电影",
      p_watch_status: "completed",
      p_platforms: ["猫耳", "漫播", "Books"],
    },
  });

  const pendingResponse = await app.inject({
    method: "POST",
    url: "/api/media",
    headers: authHeaders,
    payload: {
      title: "来源待确认",
      media_type: "电影",
      platforms: ["待定"],
    },
  });
  assert.equal(pendingResponse.statusCode, 201);
  assert.deepEqual(supabase.rpcCalls[1].params.p_platforms, ["待定"]);
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
        p_user_id: USER_ID,
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
    payload: { meal_periods: ["breakfast", "lunch", "dinner"] },
  });
  assert.equal(validResponse.statusCode, 200);
  assert.deepEqual(validResponse.json().data.dish.meal_periods, [
    "breakfast",
    "lunch",
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
      "../supabase/migrations/202607300001_dish_meal_periods.sql",
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
    taste: "",
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
      cooking_methods: ["炒"],
      taste: "香、鲜",
      flavor_options: ["紫苏", "九层塔", "紫苏"],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().data.dish.main_ingredients, ["虾", "蒜"]);
  assert.equal(response.json().data.dish.introduction, "同一道炒虾可以更换香草风味。");
  assert.deepEqual(response.json().data.dish.cooking_methods, ["炒"]);
  assert.equal(response.json().data.dish.taste, "鲜、香");
  assert.deepEqual(response.json().data.dish.flavor_options, ["紫苏", "九层塔"]);

  const invalidTasteResponse = await app.inject({
    method: "PUT",
    url: `/api/dishes/${SOURCE_ID}`,
    headers: authHeaders,
    payload: { taste: "香辣" },
  });
  assert.equal(invalidTasteResponse.statusCode, 400);
  assert.equal(invalidTasteResponse.json().error.code, "INVALID_TASTE");
});

test("home dish detail migration preserves historical rows with empty defaults", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202608040002_dish_home_details.sql",
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
      "../supabase/migrations/202608040005_standardize_dish_taste.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /无法精确匹配的历史口味/);
  assert.match(migration, /is_standard_dish_taste/);
  assert.match(migration, /array\['清淡', '咸', '鲜', '香', '酸', '甜', '辣'\]/);
  assert.doesNotMatch(migration, /like|position\s*\(/i);
});

test("menu place migration preserves legacy stores and backfills real dishes", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202608040004_menu_places_and_dishes.sql", import.meta.url),
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

test("dish ordering migration backfills newest-first and inserts new dishes first", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202608040003_dishes_newest_first.sql",
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
    cooking_methods: ["炒"],
    taste: "酸、甜",
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
  assert.deepEqual(response.json().data.dish.cooking_methods, ["炒"]);
  assert.equal(response.json().data.dish.taste, "酸、甜");
  assert.deepEqual(response.json().data.dish.flavor_options, ["少糖"]);
});

test("unified menu migration preserves stores as outside records", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202607300002_unified_menu_records.sql",
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
      "../supabase/migrations/202607300003_outside_menu_categories.sql",
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
    new URL("../supabase/migrations/202607130001_required_media_platforms.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set platforms = array\['待定'\]/);
  assert.match(migration, /cardinality\(platforms\) > 0/);
  assert.match(migration, /'待定'.*'猫耳'.*'漫播'/s);
  assert.match(migration, /not \('待定' = any\(platforms\)\).*cardinality\(platforms\) = 1/s);
});

test("Books media-platform migration updates novel sources and keeps the platform valid", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607140002_books_media_platform.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /set platforms = array\['Books'\]::text\[\]/);
  assert.match(migration, /where media_type = '小说'/);
  assert.match(migration, /'待定'.*'猫耳'.*'漫播'.*'Books'/s);
});

test("episode timeline migration stores arrays and includes notes in favorite search", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607130002_media_episode_timeline_notes.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /timeline_notes jsonb not null default '\[\]'::jsonb/i);
  assert.match(migration, /jsonb_typeof\(timeline_notes\) = 'array'/i);
  assert.match(migration, /jsonb_array_elements\(episode\.timeline_notes\)/i);
  assert.match(migration, /note ->> 'content' ilike/i);
});

test("timeline note type migration includes quote speakers and dialogue in favorite search", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607140001_media_timeline_note_types.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /jsonb_typeof\(note -> 'dialogues'\) = 'array'/i);
  assert.match(migration, /dialogue ->> 'speaker' ilike/i);
  assert.match(migration, /dialogue ->> 'content' ilike/i);
});

test("animation movies are included in episodic media creation", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/202607130003_animation_movies_episodic.sql", import.meta.url),
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

import { assertCondition } from "../../lib/errors.mjs";

export const PRODUCT_ANALYTICS_MODULES = Object.freeze([
  "home",
  "menu",
  "media",
  "activities",
  "chat_topics",
  "text_card",
  "exercise",
  "luggage",
  "wardrobe",
  "key_moments",
  "footprint",
  "profile",
]);

const MODULE_SET = new Set(PRODUCT_ANALYTICS_MODULES);
const RELEASE_CHANNELS = new Set(["develop", "trial", "release"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RETENTION_DAYS = 400;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MODULE_SESSION_MS = 30 * 60 * 1000;

const CONTENT_CREATION_ROUTES = new Map([
  ["POST /api/activities", "activities"],
  ["POST /api/chat-topics/mine", "chat_topics"],
  ["POST /api/chat-topics/mine/from-official", "chat_topics"],
  ["POST /api/dishes", "menu"],
  ["POST /api/menu-dishes", "menu"],
  ["POST /api/menu-places", "menu"],
  ["POST /api/media", "media"],
  ["POST /api/wardrobe/items", "wardrobe"],
  ["POST /api/key-moments", "key_moments"],
  ["POST /api/luggage/items", "luggage"],
  ["POST /api/exercise/complete", "exercise"],
  ["PUT /api/footprint/cities/:cityCode", "footprint"],
]);

function optionalText(value, maxLength, pattern) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  if (!normalized || (pattern && !pattern.test(normalized))) return null;
  return normalized;
}

export function sanitizeProductAttribution(value = {}) {
  const numericScene = Number(value.source_scene);
  const sourceScene = Number.isInteger(numericScene)
    && numericScene >= 0
    && numericScene <= 99_999
    ? numericScene
    : null;
  const releaseChannel = RELEASE_CHANNELS.has(value.release_channel)
    ? value.release_channel
    : null;
  return {
    source_scene: sourceScene,
    source_campaign: optionalText(value.source_campaign, 64, /^[A-Za-z0-9_-]+$/),
    source_referrer_app_id: optionalText(
      value.source_referrer_app_id,
      64,
      /^[A-Za-z0-9_-]+$/,
    ),
    release_channel: releaseChannel,
  };
}

function productEventRow({
  eventKey,
  eventName,
  uid,
  module = null,
  ingestionSource = "server",
  sizeBytes = null,
  attribution = {},
  occurredAt,
}) {
  return {
    event_key: eventKey,
    event_name: eventName,
    uid: uid || null,
    module,
    ingestion_source: ingestionSource,
    size_bytes: sizeBytes,
    ...sanitizeProductAttribution(attribution),
    occurred_at: occurredAt,
  };
}

async function insertProductEvent(supabase, row) {
  const { error } = await supabase
    .from("product_events")
    .upsert(row, { onConflict: "event_key", ignoreDuplicates: true });
  if (error) throw error;
}

function reportAnalyticsFailure(logger, message, error) {
  if (logger?.error) logger.error({ error }, message);
  else if (process.env.NODE_ENV !== "test") console.error(message, error);
}

export function resolveContentCreationModule(request, statusCode) {
  if (statusCode < 200 || statusCode >= 300 || !request.auth?.user?.uid) return null;
  const route = request.routeOptions?.url;
  const module = CONTENT_CREATION_ROUTES.get(`${request.method} ${route}`) || null;
  if (module === "footprint" && request.body?.visited === false) return null;
  return module;
}

function normalizeDate(value, fallback) {
  const candidate = typeof value === "string" ? value.trim() : "";
  assertCondition(
    !candidate || DATE_PATTERN.test(candidate),
    400,
    "INVALID_ANALYTICS_DATE",
    "统计日期格式无效。",
  );
  return candidate || fallback;
}

function shanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addUtcDays(dateText, days) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateSpan(from, to) {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  assertCondition(
    Number.isFinite(start) && Number.isFinite(end) && start <= end,
    400,
    "INVALID_ANALYTICS_RANGE",
    "统计日期范围无效。",
  );
  const days = Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
  assertCondition(
    days <= 366,
    400,
    "ANALYTICS_RANGE_TOO_LARGE",
    "单次最多查询 366 天运营数据。",
  );
  return days;
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

const DAILY_KEYS = [
  "registrations",
  "logins",
  "active_users",
  "module_opens",
  "content_creations",
  "image_uploads",
  "uploaded_bytes",
  "error_occurrences",
  "warning_occurrences",
];

function normalizeDailyRows(rows, from, days) {
  const byDate = new Map((rows || []).map((row) => [row.metric_date, row]));
  return Array.from({ length: days }, (_, index) => {
    const metricDate = addUtcDays(from, index);
    const row = byDate.get(metricDate) || {};
    return DAILY_KEYS.reduce(
      (result, key) => ({ ...result, [key]: numeric(row[key]) }),
      { metric_date: metricDate },
    );
  });
}

function aggregateBy(rows, keyName, valueKeys) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = row[keyName] || "unknown";
    const target = groups.get(key) || { [keyName]: key };
    for (const valueKey of valueKeys) {
      target[valueKey] = numeric(target[valueKey]) + numeric(row[valueKey]);
    }
    groups.set(key, target);
  }
  return [...groups.values()];
}

function normalizeSourceRows(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = [
      row.source_scene ?? "",
      row.source_campaign || "",
      row.source_referrer_app_id || "",
      row.release_channel || "",
    ].join("|");
    const target = groups.get(key) || {
      source_scene: row.source_scene === null ? null : numeric(row.source_scene),
      source_campaign: row.source_campaign || "",
      source_referrer_app_id: row.source_referrer_app_id || "",
      release_channel: row.release_channel || "",
      registrations: 0,
    };
    target.registrations += numeric(row.registrations);
    groups.set(key, target);
  }
  return [...groups.values()].sort((a, b) => b.registrations - a.registrations);
}

export function createProductAnalytics(getSupabaseAdmin, options = {}) {
  const enabled = options.enabled ?? true;
  const logger = options.logger;
  const now = options.now || (() => new Date());
  let lastCleanupAt = 0;

  async function record(row) {
    if (!enabled) return false;
    try {
      const supabase = getSupabaseAdmin();
      await insertProductEvent(supabase, row);
      const currentTime = now().getTime();
      if (currentTime - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
        lastCleanupAt = currentTime;
        const cutoff = new Date(currentTime - RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const { error } = await supabase
          .from("product_events")
          .delete()
          .neq("event_name", "registration_completed")
          .lt("occurred_at", cutoff.toISOString());
        if (error) throw error;
      }
      return true;
    } catch (error) {
      reportAnalyticsFailure(logger, "记录运营事件失败", error);
      return false;
    }
  }

  async function recordAuthentication({ request, uid, isNewUser, attribution }) {
    const occurredAt = now().toISOString();
    if (isNewUser) {
      await record(productEventRow({
        eventKey: `registration:${uid}`,
        eventName: "registration_completed",
        uid,
        attribution,
        occurredAt,
      }));
    }
    await record(productEventRow({
      eventKey: `login:${request.id}`,
      eventName: "login_succeeded",
      uid,
      attribution,
      occurredAt,
    }));
  }

  async function recordModuleOpen({ request, module, attribution }) {
    assertCondition(
      MODULE_SET.has(module),
      400,
      "INVALID_ANALYTICS_MODULE",
      "运营事件模块无效。",
    );
    const occurredAt = now();
    const bucketStart = Math.floor(occurredAt.getTime() / MODULE_SESSION_MS) * MODULE_SESSION_MS;
    return record(productEventRow({
      eventKey: `module:${request.auth.user.uid}:${module}:${bucketStart}`,
      eventName: "module_opened",
      uid: request.auth.user.uid,
      module,
      ingestionSource: "client",
      attribution,
      occurredAt: occurredAt.toISOString(),
    }));
  }

  async function recordContentCreation({ request, module }) {
    return record(productEventRow({
      eventKey: `content:${request.id}`,
      eventName: "content_created",
      uid: request.auth.user.uid,
      module,
      occurredAt: now().toISOString(),
    }));
  }

  async function recordClientContentCreation({ request, module }) {
    assertCondition(
      module === "text_card",
      400,
      "INVALID_ANALYTICS_EVENT",
      "客户端创建事件无效。",
    );
    const occurredAt = now();
    const minuteBucket = Math.floor(occurredAt.getTime() / 60_000) * 60_000;
    return record(productEventRow({
      eventKey: `client-content:${request.auth.user.uid}:${module}:${minuteBucket}`,
      eventName: "content_created",
      uid: request.auth.user.uid,
      module,
      ingestionSource: "client",
      occurredAt: occurredAt.toISOString(),
    }));
  }

  async function getAdminDashboard(query = {}) {
    const today = shanghaiDate(now());
    const requestedDays = Number(query.days || 30);
    assertCondition(
      Number.isInteger(requestedDays) && requestedDays >= 1 && requestedDays <= 366,
      400,
      "INVALID_ANALYTICS_DAYS",
      "统计天数必须在 1 到 366 天之间。",
    );
    const defaultFrom = addUtcDays(today, -(requestedDays - 1));
    const from = normalizeDate(query.from, defaultFrom);
    const to = normalizeDate(query.to, today);
    const days = dateSpan(from, to);
    const supabase = getSupabaseAdmin();
    const [dailyResult, moduleResult, sourceResult, currentResult] = await Promise.all([
      supabase
        .from("product_daily_overview")
        .select("*")
        .gte("metric_date", from)
        .lte("metric_date", to)
        .order("metric_date", { ascending: true }),
      supabase
        .from("product_module_daily")
        .select("*")
        .gte("metric_date", from)
        .lte("metric_date", to),
      supabase
        .from("product_source_daily")
        .select("*")
        .gte("metric_date", from)
        .lte("metric_date", to),
      supabase.from("product_current_summary").select("*").single(),
    ]);
    for (const result of [dailyResult, moduleResult, sourceResult, currentResult]) {
      if (result.error) throw result.error;
    }
    const daily = normalizeDailyRows(dailyResult.data, from, days);
    const totals = DAILY_KEYS.reduce(
      (result, key) => ({
        ...result,
        [key]: daily.reduce((sum, row) => sum + numeric(row[key]), 0),
      }),
      {},
    );
    return {
      range: { from, to, days },
      generated_at: now().toISOString(),
      current: Object.fromEntries(
        Object.entries(currentResult.data || {}).map(([key, value]) => [key, numeric(value)]),
      ),
      totals,
      daily,
      modules: aggregateBy(moduleResult.data, "module", [
        "unique_users",
        "module_opens",
        "content_creations",
        "image_uploads",
        "uploaded_bytes",
      ]).sort((a, b) => b.module_opens - a.module_opens),
      sources: normalizeSourceRows(sourceResult.data),
    };
  }

  return {
    getAdminDashboard,
    recordAuthentication,
    recordClientContentCreation,
    recordContentCreation,
    recordModuleOpen,
  };
}

export function createNoopProductAnalytics() {
  return {
    async getAdminDashboard() {
      return {
        range: { from: "", to: "", days: 0 },
        generated_at: "",
        current: {},
        totals: {},
        daily: [],
        modules: [],
        sources: [],
      };
    },
    async recordAuthentication() {},
    async recordClientContentCreation() {},
    async recordContentCreation() {},
    async recordModuleOpen() {},
  };
}

export async function recordImageUploaded(
  supabase,
  { objectKey, uid, module, sizeBytes, occurredAt = new Date() },
) {
  const analyticsModule = module === "avatars" ? "profile" : module;
  if (!MODULE_SET.has(analyticsModule) || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return;
  try {
    await insertProductEvent(supabase, productEventRow({
      eventKey: `image:${objectKey}`,
      eventName: "image_uploaded",
      uid,
      module: analyticsModule,
      sizeBytes: Math.round(sizeBytes),
      occurredAt: occurredAt.toISOString(),
    }));
  } catch (error) {
    reportAnalyticsFailure(null, "记录图片上传成本失败", error);
  }
}

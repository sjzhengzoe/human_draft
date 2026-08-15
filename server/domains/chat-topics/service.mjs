import { assertCondition, HttpError } from "../../lib/errors.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";

const OFFICIAL_FIELDS = "id, content, sort_order, created_at, updated_at";
const USER_FIELDS = "id, official_topic_id, content, created_at, updated_at";
const MAX_TOPIC_LENGTH = 120;
const DEFAULT_PAGE_SIZE = 5;
const MAX_PAGE_SIZE = 50;

export function normalizeTopicContent(value) {
  assertCondition(
    typeof value === "string",
    400,
    "TOPIC_CONTENT_REQUIRED",
    "请填写话题内容。",
  );
  const content = value.trim();
  assertCondition(content, 400, "TOPIC_CONTENT_REQUIRED", "请填写话题内容。");
  assertCondition(
    content.length <= MAX_TOPIC_LENGTH,
    400,
    "TOPIC_CONTENT_TOO_LONG",
    `话题不能超过 ${MAX_TOPIC_LENGTH} 个字符。`,
  );
  return content;
}

async function requireUserTopic(supabase, uid, topicId) {
  const { data, error } = await supabase
    .from("user_chat_topics")
    .select(USER_FIELDS)
    .eq("id", topicId)
    .eq("uid", uid)
    .maybeSingle();
  throwSupabaseError(error, "读取个人话题失败。");
  assertCondition(data, 404, "CHAT_TOPIC_NOT_FOUND", "个人话题不存在。");
  return data;
}

async function requireOfficialTopic(supabase, topicId) {
  assertCondition(
    typeof topicId === "string" && topicId.trim(),
    400,
    "OFFICIAL_TOPIC_REQUIRED",
    "请选择官方话题。",
  );
  const { data, error } = await supabase
    .from("official_chat_topics")
    .select(OFFICIAL_FIELDS)
    .eq("id", topicId.trim())
    .eq("is_active", true)
    .maybeSingle();
  throwSupabaseError(error, "读取官方话题失败。");
  assertCondition(data, 404, "OFFICIAL_TOPIC_NOT_FOUND", "官方话题不存在或已下架。");
  return data;
}

function positiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function paginateTopics(items, query = {}) {
  const pageSize = positiveInteger(query.page_size, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const requestedPage = positiveInteger(query.page, 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize),
    pagination: {
      page,
      page_size: pageSize,
      total,
      total_pages: totalPages,
    },
  };
}

async function listActiveOfficialTopics(supabase) {
  const { data, error } = await supabase
    .from("official_chat_topics")
    .select(OFFICIAL_FIELDS)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .order("sort_order", { ascending: false });
  throwSupabaseError(error, "读取官方话题失败。");
  return data || [];
}

export async function listPublicOfficialChatTopics(supabase, query = {}) {
  return paginateTopics(await listActiveOfficialTopics(supabase), query);
}

async function listVisibleOfficialTopics(supabase, uid) {
  const [officialResult, hiddenResult, collectedResult] = await Promise.all([
    listActiveOfficialTopics(supabase),
    supabase
      .from("user_hidden_official_chat_topics")
      .select("official_topic_id")
      .eq("uid", uid),
    supabase
      .from("user_chat_topics")
      .select("official_topic_id")
      .eq("uid", uid),
  ]);
  throwSupabaseError(hiddenResult.error, "读取话题偏好失败。");
  throwSupabaseError(collectedResult.error, "读取个人话题失败。");
  const hiddenIds = new Set((hiddenResult.data || []).map((item) => item.official_topic_id));
  const collectedIds = new Set(
    (collectedResult.data || [])
      .map((item) => item.official_topic_id)
      .filter(Boolean),
  );
  return officialResult.filter(
    (item) => !hiddenIds.has(item.id) && !collectedIds.has(item.id),
  );
}

export async function listChatTopics(supabase, uid, query = {}) {
  const [officialItems, mineResult] = await Promise.all([
    listVisibleOfficialTopics(supabase, uid),
    supabase
      .from("user_chat_topics")
      .select(USER_FIELDS)
      .eq("uid", uid)
      .order("created_at", { ascending: false }),
  ]);
  throwSupabaseError(mineResult.error, "读取个人话题失败。");
  const officialPage = paginateTopics(officialItems, query);
  return {
    official_items: officialPage.items,
    official_pagination: officialPage.pagination,
    my_items: mineResult.data || [],
  };
}

export async function listHiddenOfficialChatTopics(supabase, uid, query = {}) {
  const [officialResult, hiddenResult] = await Promise.all([
    supabase
      .from("official_chat_topics")
      .select(OFFICIAL_FIELDS)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .order("sort_order", { ascending: false }),
    supabase
      .from("user_hidden_official_chat_topics")
      .select("official_topic_id")
      .eq("uid", uid),
  ]);
  throwSupabaseError(officialResult.error, "读取官方话题失败。");
  throwSupabaseError(hiddenResult.error, "读取隐藏话题失败。");
  const hiddenIds = new Set((hiddenResult.data || []).map((item) => item.official_topic_id));
  return paginateTopics(
    (officialResult.data || []).filter((item) => hiddenIds.has(item.id)),
    query,
  );
}

export async function createUserChatTopic(supabase, uid, body) {
  const content = normalizeTopicContent(body.content);
  const { data, error } = await supabase
    .from("user_chat_topics")
    .insert({ uid: uid, content })
    .select(USER_FIELDS)
    .single();
  throwSupabaseError(error, "新增个人话题失败。");
  return data;
}

export async function createOfficialChatTopic(supabase, body) {
  const content = normalizeTopicContent(body.content);
  const { data, error } = await supabase
    .from("official_chat_topics")
    .insert({
      content,
      sort_order: Date.now(),
      is_active: true,
    })
    .select(OFFICIAL_FIELDS)
    .single();
  if (error?.code === "23505") {
    throw new HttpError(409, "OFFICIAL_TOPIC_DUPLICATE", "这个官方话题已经存在。");
  }
  throwSupabaseError(error, "新增官方话题失败。");
  return data;
}

export async function updateOfficialChatTopic(supabase, topicId, body, options = {}) {
  const current = await requireOfficialTopic(supabase, topicId);
  const content = normalizeTopicContent(body.content);
  if (content !== current.content) await options.checkText?.(content);
  const { data, error } = await supabase
    .from("official_chat_topics")
    .update({ content })
    .eq("id", current.id)
    .select(OFFICIAL_FIELDS)
    .single();
  if (error?.code === "23505") {
    throw new HttpError(409, "OFFICIAL_TOPIC_DUPLICATE", "这个官方话题已经存在。");
  }
  throwSupabaseError(error, "更新官方话题失败。");
  return data;
}

export async function deleteOfficialChatTopic(supabase, topicId) {
  const current = await requireOfficialTopic(supabase, topicId);
  const { error } = await supabase
    .from("official_chat_topics")
    .delete()
    .eq("id", current.id);
  throwSupabaseError(error, "删除官方话题失败。");
}

export async function hideOfficialChatTopic(supabase, uid, topicId) {
  const current = await requireOfficialTopic(supabase, topicId);
  const { data: existing, error: existingError } = await supabase
    .from("user_hidden_official_chat_topics")
    .select("official_topic_id")
    .eq("uid", uid)
    .eq("official_topic_id", current.id)
    .maybeSingle();
  throwSupabaseError(existingError, "读取话题偏好失败。");
  if (existing) return;
  const { error } = await supabase
    .from("user_hidden_official_chat_topics")
    .insert({ uid: uid, official_topic_id: current.id });
  if (error?.code === "23505") return;
  throwSupabaseError(error, "隐藏话题失败。");
}

export async function restoreOfficialChatTopic(supabase, uid, topicId) {
  const { error } = await supabase
    .from("user_hidden_official_chat_topics")
    .delete()
    .eq("uid", uid)
    .eq("official_topic_id", topicId);
  throwSupabaseError(error, "恢复话题失败。");
}

export async function addOfficialChatTopic(supabase, uid, officialTopicId) {
  const officialTopic = await requireOfficialTopic(supabase, officialTopicId);

  const { data: existing, error: existingError } = await supabase
    .from("user_chat_topics")
    .select(USER_FIELDS)
    .eq("uid", uid)
    .eq("official_topic_id", officialTopic.id)
    .maybeSingle();
  throwSupabaseError(existingError, "读取个人话题失败。");
  if (existing) return { item: existing, created: false };

  const { data, error } = await supabase
    .from("user_chat_topics")
    .insert({
      uid: uid,
      official_topic_id: officialTopic.id,
      content: officialTopic.content,
    })
    .select(USER_FIELDS)
    .single();
  if (error?.code === "23505") {
    throw new HttpError(409, "OFFICIAL_TOPIC_ALREADY_ADDED", "这个话题已经收藏。");
  }
  throwSupabaseError(error, "收藏话题失败。");
  return { item: data, created: true };
}

export async function updateUserChatTopic(supabase, uid, topicId, body, options = {}) {
  const current = await requireUserTopic(supabase, uid, topicId);
  assertCondition(
    !current.official_topic_id,
    403,
    "OFFICIAL_TOPIC_READ_ONLY",
    "官方收录的话题不能编辑。",
  );
  const content = normalizeTopicContent(body.content);
  if (content !== current.content) await options.checkText?.(content);
  const { data, error } = await supabase
    .from("user_chat_topics")
    .update({ content })
    .eq("id", current.id)
    .eq("uid", uid)
    .select(USER_FIELDS)
    .single();
  throwSupabaseError(error, "更新个人话题失败。");
  return data;
}

export async function deleteUserChatTopic(supabase, uid, topicId) {
  const current = await requireUserTopic(supabase, uid, topicId);
  const { error } = await supabase
    .from("user_chat_topics")
    .delete()
    .eq("id", current.id)
    .eq("uid", uid);
  throwSupabaseError(error, "删除个人话题失败。");
}

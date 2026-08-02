import { assertCondition, HttpError } from "./errors.mjs";
import { throwSupabaseError } from "./supabase.mjs";

const OFFICIAL_FIELDS = "id, content, sort_order, created_at, updated_at";
const USER_FIELDS = "id, official_topic_id, content, created_at, updated_at";
const MAX_TOPIC_LENGTH = 120;

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

async function requireUserTopic(supabase, userId, topicId) {
  const { data, error } = await supabase
    .from("user_chat_topics")
    .select(USER_FIELDS)
    .eq("id", topicId)
    .eq("user_id", userId)
    .maybeSingle();
  throwSupabaseError(error, "读取个人话题失败。");
  assertCondition(data, 404, "CHAT_TOPIC_NOT_FOUND", "个人话题不存在。");
  return data;
}

export async function listChatTopics(supabase, userId) {
  const [officialResult, mineResult] = await Promise.all([
    supabase
      .from("official_chat_topics")
      .select(OFFICIAL_FIELDS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("user_chat_topics")
      .select(USER_FIELDS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);
  throwSupabaseError(officialResult.error, "读取官方话题失败。");
  throwSupabaseError(mineResult.error, "读取个人话题失败。");
  return {
    official_items: officialResult.data || [],
    my_items: mineResult.data || [],
  };
}

export async function createUserChatTopic(supabase, userId, body) {
  const content = normalizeTopicContent(body.content);
  const { data, error } = await supabase
    .from("user_chat_topics")
    .insert({ user_id: userId, content })
    .select(USER_FIELDS)
    .single();
  throwSupabaseError(error, "新增个人话题失败。");
  return data;
}

export async function addOfficialChatTopic(supabase, userId, officialTopicId) {
  assertCondition(
    typeof officialTopicId === "string" && officialTopicId.trim(),
    400,
    "OFFICIAL_TOPIC_REQUIRED",
    "请选择官方话题。",
  );
  const { data: officialTopic, error: officialError } = await supabase
    .from("official_chat_topics")
    .select("id, content")
    .eq("id", officialTopicId.trim())
    .eq("is_active", true)
    .maybeSingle();
  throwSupabaseError(officialError, "读取官方话题失败。");
  assertCondition(officialTopic, 404, "OFFICIAL_TOPIC_NOT_FOUND", "官方话题不存在或已下架。");

  const { data: existing, error: existingError } = await supabase
    .from("user_chat_topics")
    .select(USER_FIELDS)
    .eq("user_id", userId)
    .eq("official_topic_id", officialTopic.id)
    .maybeSingle();
  throwSupabaseError(existingError, "读取个人话题失败。");
  if (existing) return { item: existing, created: false };

  const { data, error } = await supabase
    .from("user_chat_topics")
    .insert({
      user_id: userId,
      official_topic_id: officialTopic.id,
      content: officialTopic.content,
    })
    .select(USER_FIELDS)
    .single();
  if (error?.code === "23505") {
    throw new HttpError(409, "OFFICIAL_TOPIC_ALREADY_ADDED", "这个话题已在我的话题中。");
  }
  throwSupabaseError(error, "加入个人话题失败。");
  return { item: data, created: true };
}

export async function updateUserChatTopic(supabase, userId, topicId, body) {
  const current = await requireUserTopic(supabase, userId, topicId);
  const content = normalizeTopicContent(body.content);
  const { data, error } = await supabase
    .from("user_chat_topics")
    .update({ content })
    .eq("id", current.id)
    .eq("user_id", userId)
    .select(USER_FIELDS)
    .single();
  throwSupabaseError(error, "更新个人话题失败。");
  return data;
}

export async function deleteUserChatTopic(supabase, userId, topicId) {
  const current = await requireUserTopic(supabase, userId, topicId);
  const { error } = await supabase
    .from("user_chat_topics")
    .delete()
    .eq("id", current.id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除个人话题失败。");
}

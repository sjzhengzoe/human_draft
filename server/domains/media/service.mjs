import { randomUUID } from "node:crypto";
import { config } from "../../config.mjs";
import { HttpError, assertCondition } from "../../lib/errors.mjs";
import { STANDARD_IMAGE_TYPES } from "../../http/multipart-image.mjs";
import { optimizeOriginalImage } from "../../lib/image-processing.mjs";
import { throwSupabaseError } from "../../lib/supabase.mjs";
import {
  booleanValue,
  enumValue,
  integerValue,
  requiredText,
  requireRecord,
  textArray,
  UUID_PATTERN,
} from "../shared/records.mjs";

export const MEDIA_STATUSES = ["planned", "in_progress", "completed"];
export const MEDIA_PLATFORMS = [
  "腾讯视频",
  "爱奇艺",
  "哔哩哔哩",
  "夸克",
  "优酷",
  "芒果 TV",
  "猫耳",
  "漫播",
  "Books",
];
export const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"];
export const MEDIA_TIMELINE_NOTE_TYPES = ["normal", "key", "quote"];

function managedMediaCoverPath(url, userId, mediaEntryId) {
  if (typeof url !== "string" || !url.trim()) return "";
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const marker = `/${config.mediaCoverBucket}/`;
    const markerIndex = pathname.lastIndexOf(marker);
    if (markerIndex < 0) return "";
    const path = pathname.slice(markerIndex + marker.length);
    const expectedPrefix = `users/${userId}/entries/${mediaEntryId}/`;
    return path.startsWith(expectedPrefix) ? path : "";
  } catch (_error) {
    return "";
  }
}

async function removeManagedMediaCover(supabase, path) {
  if (!path) return;
  const { error } = await supabase.storage.from(config.mediaCoverBucket).remove([path]);
  if (error) console.error("删除旧影视封面失败:", error);
}

function mediaPlatforms(value) {
  const platforms = textArray(value, "平台", MEDIA_PLATFORMS.length);
  assertCondition(
    platforms.every((platform) => MEDIA_PLATFORMS.includes(platform)),
    400,
    "INVALID_MEDIA_PLATFORM",
    "影视平台无效，请从给出的选项中选择。",
  );
  return platforms;
}

function timelineNotes(value) {
  assertCondition(Array.isArray(value), 400, "INVALID_TIMELINE_NOTES", "时间点记录格式无效。");
  assertCondition(value.length <= 100, 400, "TOO_MANY_TIMELINE_NOTES", "每集最多记录 100 个时间点。");
  const ids = new Set();
  const notes = value.map((item) => {
    assertCondition(
      item && typeof item === "object" && !Array.isArray(item),
      400,
      "INVALID_TIMELINE_NOTE",
      "时间点记录格式无效。",
    );
    const suppliedId = typeof item.id === "string" ? item.id.trim() : "";
    assertCondition(
      !suppliedId || /^[a-zA-Z0-9_-]{1,80}$/.test(suppliedId),
      400,
      "INVALID_TIMELINE_NOTE_ID",
      "时间点记录编号无效。",
    );
    const id = suppliedId || randomUUID();
    assertCondition(!ids.has(id), 400, "DUPLICATE_TIMELINE_NOTE_ID", "时间点记录编号不能重复。");
    ids.add(id);
    const timecode = typeof item.timecode === "string" ? item.timecode.trim() : "";
    assertCondition(
      /^\d{2}:[0-5]\d:[0-5]\d$/.test(timecode),
      400,
      "INVALID_TIMECODE",
      "时间点需使用 HH:MM:SS 格式，例如 01:03:09。",
    );
    const type = item.type === undefined
      ? "normal"
      : enumValue(item.type, MEDIA_TIMELINE_NOTE_TYPES, "时间点类型");
    const content = typeof item.content === "string" ? item.content.trim() : "";
    assertCondition(content.length <= 500, 400, "TIMELINE_CONTENT_TOO_LONG", "单条时间点内容不能超过 500 个字符。");
    if (type !== "quote") {
      assertCondition(content.length > 0, 400, "TIMELINE_CONTENT_REQUIRED", "请填写时间点内容。");
      return { id, timecode, type, content, dialogues: [] };
    }

    assertCondition(Array.isArray(item.dialogues), 400, "INVALID_TIMELINE_DIALOGUES", "语录对话格式无效。");
    assertCondition(item.dialogues.length > 0, 400, "TIMELINE_DIALOGUE_REQUIRED", "语录至少需要一条对话。");
    assertCondition(item.dialogues.length <= 20, 400, "TOO_MANY_TIMELINE_DIALOGUES", "单个时间点最多记录 20 条对话。");
    const dialogueIds = new Set();
    const dialogues = item.dialogues.map((dialogue) => {
      assertCondition(
        dialogue && typeof dialogue === "object" && !Array.isArray(dialogue),
        400,
        "INVALID_TIMELINE_DIALOGUE",
        "语录对话格式无效。",
      );
      const suppliedDialogueId = typeof dialogue.id === "string" ? dialogue.id.trim() : "";
      assertCondition(
        !suppliedDialogueId || /^[a-zA-Z0-9_-]{1,80}$/.test(suppliedDialogueId),
        400,
        "INVALID_TIMELINE_DIALOGUE_ID",
        "语录对话编号无效。",
      );
      const dialogueId = suppliedDialogueId || randomUUID();
      assertCondition(
        !dialogueIds.has(dialogueId),
        400,
        "DUPLICATE_TIMELINE_DIALOGUE_ID",
        "同一时间点内的语录对话编号不能重复。",
      );
      dialogueIds.add(dialogueId);
      const speaker = requiredText(dialogue.speaker, "说话人", 40);
      const dialogueContent = requiredText(dialogue.content, "语录内容", 500);
      return { id: dialogueId, speaker, content: dialogueContent };
    });
    return { id, timecode, type, content: "", dialogues };
  });
  return notes.sort((left, right) => left.timecode.localeCompare(right.timecode));
}

async function assertMediaTitleAvailable(supabase, userId, title, mediaType, excludedId = "") {
  const { data, error } = await supabase
    .from("media_entries")
    .select("id,title")
    .eq("user_id", userId)
    .eq("media_type", mediaType);
  throwSupabaseError(error, "检查影视名称失败。");
  const normalizedTitle = title.toLocaleLowerCase();
  const duplicate = (data || []).some(
    (entry) => entry.id !== excludedId && entry.title.trim().toLocaleLowerCase() === normalizedTitle,
  );
  assertCondition(
    !duplicate,
    409,
    "MEDIA_TITLE_EXISTS",
    `“${title}”已存在于“${mediaType}”分类中，不能重复添加。`,
  );
}

const MEDIA_TITLE_UNIQUE_ERROR = {
  23505: {
    statusCode: 409,
    code: "MEDIA_TITLE_EXISTS",
    message: "同一分类下已存在同名影视条目。",
  },
};

export async function listMediaEntries(supabase, userId, query) {
  const mediaType = typeof query.media_type === "string" && query.media_type.trim()
    ? requiredText(query.media_type, "影视分类", 40)
    : "";
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.page_size) || 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = supabase
    .from("media_entries")
    .select("*", { count: "exact" })
    .eq("user_id", userId);

  if (mediaType) request = request.eq("media_type", mediaType);

  if (query.watch_status) {
    request = request.eq(
      "watch_status",
      enumValue(query.watch_status, MEDIA_STATUSES, "观看状态"),
    );
  }
  if (query.is_revisitable === "true") request = request.eq("is_revisitable", true);
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("title", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  if (query.sort === "created_desc") {
    request = request.order("created_at", { ascending: false });
  } else {
    request = request
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
  }

  const { data, error, count } = await request.range(from, to);
  throwSupabaseError(error, "读取影视记录失败。");
  return {
    items: data,
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      has_more: to + 1 < (count || 0),
    },
  };
}

export async function getMediaEntry(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视条目编号无效。");
  return requireRecord(supabase, userId, "media_entries", id);
}

export async function createMediaEntry(supabase, userId, body) {
  const mediaType = requiredText(body.media_type, "影视分类", 40);
  const title = requiredText(body.title, "名称");
  const platforms = mediaPlatforms(body.platforms || []);
  await assertMediaTitleAvailable(supabase, userId, title, mediaType);
  let { data, error } = await supabase
    .rpc("create_media_entry_at_end", {
      p_user_id: userId,
      p_title: title,
      p_media_type: mediaType,
      p_watch_status: enumValue(
        body.watch_status || "completed",
        MEDIA_STATUSES,
        "观看状态",
      ),
      p_platforms: platforms,
    })
    .single();
  throwSupabaseError(error, "新增影视条目失败。", MEDIA_TITLE_UNIQUE_ERROR);
  if (body.is_revisitable !== undefined && booleanValue(body.is_revisitable, "值得重温标记")) {
    const result = await supabase
      .from("media_entries")
      .update({ is_revisitable: true })
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("*")
      .single();
    throwSupabaseError(result.error, "更新值得重温标记失败。");
    data = result.data;
  }
  return data;
}

export async function updateMediaEntry(supabase, userId, id, body) {
  const current = await requireRecord(supabase, userId, "media_entries", id);
  const changes = {};
  if (body.title !== undefined) changes.title = requiredText(body.title, "名称");
  if (body.media_type !== undefined) {
    changes.media_type = requiredText(body.media_type, "影视分类", 40);
  }
  if (body.watch_status !== undefined) {
    changes.watch_status = enumValue(body.watch_status, MEDIA_STATUSES, "观看状态");
  }
  if (body.platforms !== undefined) changes.platforms = mediaPlatforms(body.platforms);
  if (body.is_revisitable !== undefined) {
    changes.is_revisitable = booleanValue(body.is_revisitable, "值得重温标记");
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。" );
  if (changes.title !== undefined || changes.media_type !== undefined) {
    await assertMediaTitleAvailable(
      supabase,
      userId,
      changes.title ?? current.title,
      changes.media_type ?? current.media_type,
      id,
    );
  }
  // Any explicit category assignment must be resolved under the destination
  // category lock. The category may have changed after the existence check.
  if (changes.media_type) {
    let { data, error } = await supabase
      .rpc("move_media_entry_to_type_at_end", {
        p_user_id: userId,
        p_entry_id: id,
        p_title: changes.title ?? null,
        p_media_type: changes.media_type,
        p_watch_status: changes.watch_status ?? null,
        p_platforms: changes.platforms ?? null,
      })
      .single();
    throwSupabaseError(error, "更新影视条目失败。", {
      ...MEDIA_TITLE_UNIQUE_ERROR,
      P0002: {
        statusCode: 404,
        code: "MEDIA_ENTRY_NOT_FOUND",
        message: "影视条目不存在。",
      },
    });
    if (changes.is_revisitable !== undefined) {
      const result = await supabase
        .from("media_entries")
        .update({ is_revisitable: changes.is_revisitable })
        .eq("id", id)
        .eq("user_id", userId)
        .select("*")
        .single();
      throwSupabaseError(result.error, "更新值得重温标记失败。");
      data = result.data;
    }
    return data;
  }

  const { data, error } = await supabase
    .from("media_entries")
    .update(changes)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新影视条目失败。", MEDIA_TITLE_UNIQUE_ERROR);
  return data;
}

export async function deleteMediaEntry(supabase, userId, id) {
  await requireRecord(supabase, userId, "media_entries", id, "id");
  const { error } = await supabase
    .from("media_entries")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除影视条目失败。");
}

export async function setMediaEntryCoverFromSeason(supabase, userId, id, body) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视条目编号无效。");
  const seasonId = typeof body.season_id === "string" ? body.season_id.trim() : "";
  assertCondition(UUID_PATTERN.test(seasonId), 400, "INVALID_ID", "季编号无效。");
  const current = await requireRecord(supabase, userId, "media_entries", id, "id,cover_url");
  const season = await requireRecord(
    supabase,
    userId,
    "media_seasons",
    seasonId,
    "id,media_entry_id,cover_url",
  );
  assertCondition(
    season.media_entry_id === id,
    400,
    "SEASON_ENTRY_MISMATCH",
    "所选季不属于这部作品。",
  );
  assertCondition(
    typeof season.cover_url === "string" && season.cover_url.trim().length > 0,
    400,
    "SEASON_COVER_MISSING",
    "这一季还没有图片，不能设为作品封面。",
  );
  const { data, error } = await supabase
    .from("media_entries")
    .update({ cover_url: season.cover_url.trim() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "设置作品封面失败。");
  await removeManagedMediaCover(
    supabase,
    managedMediaCoverPath(current.cover_url, userId, id),
  );
  return data;
}

export async function replaceMediaEntryCover(supabase, userId, id, image) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视条目编号无效。");
  assertCondition(image?.buffer?.length, 400, "IMAGE_REQUIRED", "请选择影视封面。");
  assertCondition(
    STANDARD_IMAGE_TYPES.has(image.mimetype),
    415,
    "UNSUPPORTED_IMAGE_TYPE",
    "仅支持 PNG、JPEG 或 WebP 图片。",
  );
  const current = await requireRecord(supabase, userId, "media_entries", id, "id,cover_url");
  let optimized;
  try {
    optimized = await optimizeOriginalImage(image.buffer);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const wrapped = new HttpError(400, "INVALID_IMAGE", "图片文件损坏或格式不受支持。");
    wrapped.cause = error;
    throw wrapped;
  }

  const path = `users/${userId}/entries/${id}/${randomUUID()}.webp`;
  const bucket = supabase.storage.from(config.mediaCoverBucket);
  const { error: uploadError } = await bucket.upload(path, optimized.original, {
    cacheControl: "31536000",
    contentType: optimized.originalContentType,
    upsert: false,
  });
  if (uploadError) {
    const wrapped = new HttpError(500, "MEDIA_COVER_UPLOAD_FAILED", "上传影视封面失败。");
    wrapped.cause = uploadError;
    throw wrapped;
  }

  const coverUrl = bucket.getPublicUrl(path).data.publicUrl;
  const { data, error } = await supabase
    .from("media_entries")
    .update({ cover_url: coverUrl })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) {
    await removeManagedMediaCover(supabase, path);
    throwSupabaseError(error, "更新影视封面失败。");
  }

  await removeManagedMediaCover(
    supabase,
    managedMediaCoverPath(current.cover_url, userId, id),
  );
  return data;
}

export async function reorderMediaEntries(supabase, userId, body) {
  const mediaType = requiredText(body.media_type, "影视分类", 40);
  const ids = Array.isArray(body.ids) ? body.ids : [];
  assertCondition(
    ids.length > 0 && ids.length <= 500 && ids.every((id) => typeof id === "string"),
    400,
    "INVALID_IDS",
    "排序列表无效。",
  );
  assertCondition(new Set(ids).size === ids.length, 400, "DUPLICATE_IDS", "排序列表包含重复条目。" );
  const { error } = await supabase.rpc("reorder_media_entries", {
    p_user_id: userId,
    p_media_type: mediaType,
    p_entry_ids: ids,
  });
  throwSupabaseError(error, "保存影视排序失败。", {
    "22023": {
      statusCode: 400,
      code: "INVALID_MEDIA_ORDER",
      message: "排序列表包含不存在、无效或分类不一致的影视条目。",
    },
  });
  return { updated: ids.length };
}

export async function listMediaSeasons(supabase, userId, mediaEntryId) {
  assertCondition(UUID_PATTERN.test(mediaEntryId), 400, "INVALID_ID", "影视条目编号无效。");
  await requireRecord(supabase, userId, "media_entries", mediaEntryId, "id");
  const { data, error } = await supabase
    .from("media_seasons")
    .select("*, media_episodes(*)")
    .eq("user_id", userId)
    .eq("media_entry_id", mediaEntryId)
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取分季和单集失败。");
  return (data || []).map((season) => ({
    ...season,
    episodes: [...(season.media_episodes || [])].sort(
      (left, right) => left.episode_number - right.episode_number,
    ),
    media_episodes: undefined,
  }));
}

export async function createMediaSeason(supabase, userId, mediaEntryId, body) {
  assertCondition(UUID_PATTERN.test(mediaEntryId), 400, "INVALID_ID", "影视条目编号无效。");
  const name = requiredText(body.name, "季名称", 80);
  const episodeCount = integerValue(body.episode_count ?? 0, "总集数", 0, 500);
  const { data, error } = await supabase
    .rpc("create_media_season_with_episodes", {
      p_user_id: userId,
      p_media_entry_id: mediaEntryId,
      p_name: name,
      p_episode_count: episodeCount,
    })
    .single();
  throwSupabaseError(error, "新增季失败。", {
    23505: { statusCode: 409, code: "MEDIA_SEASON_EXISTS", message: "这部作品中已存在同名的季。" },
    22023: { statusCode: 400, code: "MEDIA_TYPE_NOT_EPISODIC", message: "该影视分类不支持分季和单集。" },
    P0002: { statusCode: 404, code: "MEDIA_ENTRY_NOT_FOUND", message: "影视条目不存在。" },
  });
  return data;
}

export async function updateMediaSeason(supabase, userId, id, body) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "季编号无效。");
  const name = requiredText(body.name, "季名称", 80);
  const { data, error } = await supabase
    .from("media_seasons")
    .update({ name })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新季失败。", {
    23505: { statusCode: 409, code: "MEDIA_SEASON_EXISTS", message: "这部作品中已存在同名的季。" },
  });
  return data;
}

export async function deleteMediaSeason(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "季编号无效。");
  await requireRecord(supabase, userId, "media_seasons", id, "id");
  const { error } = await supabase
    .from("media_seasons")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除季失败。");
}

export async function addNextMediaEpisode(supabase, userId, seasonId) {
  assertCondition(UUID_PATTERN.test(seasonId), 400, "INVALID_ID", "季编号无效。");
  const { data, error } = await supabase
    .rpc("add_next_media_episode", { p_user_id: userId, p_season_id: seasonId })
    .single();
  throwSupabaseError(error, "增加下一集失败。", {
    P0002: { statusCode: 404, code: "MEDIA_SEASON_NOT_FOUND", message: "季不存在。" },
  });
  return data;
}

export async function getMediaEpisode(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "单集编号无效。");
  return requireRecord(supabase, userId, "media_episodes", id);
}

export async function updateMediaEpisode(supabase, userId, id, body) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "单集编号无效。");
  const changes = {};
  if (body.title !== undefined) {
    assertCondition(typeof body.title === "string", 400, "INVALID_TEXT", "单集标题无效。");
    changes.title = body.title.trim();
    assertCondition(changes.title.length <= 120, 400, "TEXT_TOO_LONG", "单集标题不能超过 120 个字符。");
  }
  if (body.plot_summary !== undefined) {
    assertCondition(typeof body.plot_summary === "string", 400, "INVALID_TEXT", "剧情记录无效。");
    changes.plot_summary = body.plot_summary.trim();
    assertCondition(changes.plot_summary.length <= 2000, 400, "TEXT_TOO_LONG", "剧情记录不能超过 2000 个字符。");
  }
  if (body.timeline_notes !== undefined) {
    changes.timeline_notes = timelineNotes(body.timeline_notes);
  }
  if (body.is_favorite !== undefined) {
    changes.is_favorite = booleanValue(body.is_favorite, "喜欢标记");
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const { data, error } = await supabase
    .from("media_episodes")
    .update(changes)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新单集失败。");
  return data;
}

export async function listFavoriteMediaEpisodes(supabase, userId, query) {
  const mediaType = requiredText(query.media_type, "影视分类", 40);
  const keyword = typeof query.keyword === "string" ? query.keyword.trim().slice(0, 80) : "";
  const { data, error } = await supabase.rpc("search_favorite_media_episodes", {
    p_user_id: userId,
    p_media_type: mediaType,
    p_keyword: keyword,
  });
  throwSupabaseError(error, "读取喜欢的单集失败。");
  return data || [];
}

export async function listMediaCategories(supabase, userId) {
  const { data, error } = await supabase
    .from("media_categories")
    .select("*")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取影视分类失败。");
  return data;
}

export async function getMediaCategory(supabase, userId, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视分类编号无效。");
  return requireRecord(supabase, userId, "media_categories", id);
}

export async function createMediaCategory(supabase, userId, body) {
  const { data, error } = await supabase
    .rpc("create_media_category_at_end", {
      p_user_id: userId,
      p_name: requiredText(body.name, "分类名称", 40),
    })
    .single();
  throwSupabaseError(error, "新增影视分类失败。", {
    23505: { statusCode: 409, code: "MEDIA_CATEGORY_EXISTS", message: "分类名称已存在。" },
  });
  return data;
}

export async function updateMediaCategory(supabase, userId, id, body) {
  await getMediaCategory(supabase, userId, id);
  const { data, error } = await supabase
    .from("media_categories")
    .update({ name: requiredText(body.name, "分类名称", 40) })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  throwSupabaseError(error, "更新影视分类失败。", {
    23505: { statusCode: 409, code: "MEDIA_CATEGORY_EXISTS", message: "分类名称已存在。" },
  });
  return data;
}

export async function deleteMediaCategory(supabase, userId, id) {
  const category = await getMediaCategory(supabase, userId, id);
  const { data: entry, error: entryError } = await supabase
    .from("media_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("media_type", category.name)
    .limit(1)
    .maybeSingle();
  throwSupabaseError(entryError, "检查影视分类失败。");
  assertCondition(!entry, 409, "MEDIA_CATEGORY_NOT_EMPTY", "分类下还有影视条目，暂时不能删除。");
  const { error } = await supabase
    .from("media_categories")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  throwSupabaseError(error, "删除影视分类失败。");
}

export async function swapMediaCategorySortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId) && sourceId !== targetId,
    400,
    "INVALID_IDS",
    "请选择两个不同的影视分类。",
  );
  const { error } = await supabase.rpc("swap_media_category_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整影视分类排序失败。", {
    P0002: { statusCode: 404, code: "MEDIA_CATEGORY_NOT_FOUND", message: "影视分类不存在。" },
  });
  return { updated: 2 };
}

export async function swapMediaEntrySortOrders(supabase, userId, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId),
    400,
    "INVALID_IDS",
    "交换位置的影视条目无效。",
  );
  assertCondition(
    sourceId !== targetId,
    400,
    "DUPLICATE_IDS",
    "请选择两个不同的影视条目交换位置。",
  );

  const { error } = await supabase.rpc("swap_media_entry_sort_orders", {
    p_user_id: userId,
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "交换影视排序失败。", {
    P0002: {
      statusCode: 404,
      code: "MEDIA_ENTRY_NOT_FOUND",
      message: "交换位置的影视条目不存在。",
    },
    "22023": {
      statusCode: 400,
      code: "INVALID_MEDIA_SWAP",
      message: "只能交换同一分类下的影视条目。",
    },
  });
  return { updated: 2 };
}

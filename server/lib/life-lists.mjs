import { assertCondition } from "./errors.mjs";
import { throwSupabaseError } from "./supabase.mjs";

export const MEDIA_STATUSES = ["planned", "in_progress", "completed"];
export const MEDIA_PLATFORMS = ["腾讯视频", "爱奇艺", "哔哩哔哩", "夸克", "优酷", "芒果 TV", "猫耳", "漫播"];
export const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "广播剧"];
export const ACTIVITY_TYPES = ["室内", "户外", "居家"];
export const DINING_MODES = ["takeout", "dine_in"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requiredText(value, fieldName, maxLength = 120) {
  assertCondition(
    typeof value === "string" && value.trim().length > 0,
    400,
    "TEXT_REQUIRED",
    `请填写${fieldName}。`,
  );
  const text = value.trim();
  assertCondition(
    text.length <= maxLength,
    400,
    "TEXT_TOO_LONG",
    `${fieldName}不能超过 ${maxLength} 个字符。`,
  );
  return text;
}

function textArray(value, fieldName, maxItems = 30) {
  assertCondition(Array.isArray(value), 400, "INVALID_ARRAY", `${fieldName}格式无效。`);
  const items = [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  assertCondition(items.length <= maxItems, 400, "TOO_MANY_ITEMS", `${fieldName}数量过多。`);
  assertCondition(
    items.every((item) => item.length <= 80),
    400,
    "ITEM_TOO_LONG",
    `${fieldName}中的单项不能超过 80 个字符。`,
  );
  return items;
}

function enumValue(value, allowed, fieldName) {
  assertCondition(
    typeof value === "string" && allowed.includes(value),
    400,
    "INVALID_ENUM_VALUE",
    `${fieldName}无效。`,
  );
  return value;
}

function booleanValue(value, fieldName) {
  assertCondition(typeof value === "boolean", 400, "INVALID_BOOLEAN", `${fieldName}无效。`);
  return value;
}

function integerValue(value, fieldName, minimum, maximum) {
  assertCondition(
    Number.isInteger(value) && value >= minimum && value <= maximum,
    400,
    "INVALID_INTEGER",
    `${fieldName}必须在 ${minimum} 到 ${maximum} 之间。`,
  );
  return value;
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

async function assertMediaTitleAvailable(supabase, title, mediaType, excludedId = "") {
  const { data, error } = await supabase
    .from("media_entries")
    .select("id,title")
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

async function nextSortOrder(supabase, table, filters = {}) {
  let query = supabase
    .from(table)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });
  const { data, error } = await query.maybeSingle();
  throwSupabaseError(error, "读取排序位置失败。");
  return Number(data?.sort_order || 0) + 1000;
}

async function requireRecord(supabase, table, id, fields = "*") {
  const { data, error } = await supabase
    .from(table)
    .select(fields)
    .eq("id", id)
    .maybeSingle();
  throwSupabaseError(error, "读取记录失败。");
  assertCondition(data, 404, "RECORD_NOT_FOUND", "记录不存在。" );
  return data;
}

export async function listMediaEntries(supabase, query) {
  const mediaType = requiredText(query.media_type, "影视分类", 40);
  const page = Math.max(1, Math.trunc(Number(query.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(Number(query.page_size) || 20)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let request = supabase
    .from("media_entries")
    .select("*", { count: "exact" })
    .eq("media_type", mediaType);

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
  throwSupabaseError(error, "读取影视清单失败。");
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

export async function getMediaEntry(supabase, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视条目编号无效。");
  return requireRecord(supabase, "media_entries", id);
}

export async function createMediaEntry(supabase, body) {
  const mediaType = requiredText(body.media_type, "影视分类", 40);
  const title = requiredText(body.title, "名称");
  await assertMediaTitleAvailable(supabase, title, mediaType);
  let { data, error } = await supabase
    .rpc("create_media_entry_at_end", {
      p_title: title,
      p_media_type: mediaType,
      p_watch_status: enumValue(
        body.watch_status || "completed",
        MEDIA_STATUSES,
        "观看状态",
      ),
      p_platforms: mediaPlatforms(body.platforms || []),
    })
    .single();
  throwSupabaseError(error, "新增影视条目失败。", MEDIA_TITLE_UNIQUE_ERROR);
  if (body.is_revisitable !== undefined && booleanValue(body.is_revisitable, "值得重温标记")) {
    const result = await supabase
      .from("media_entries")
      .update({ is_revisitable: true })
      .eq("id", data.id)
      .select("*")
      .single();
    throwSupabaseError(result.error, "更新值得重温标记失败。");
    data = result.data;
  }
  return data;
}

export async function updateMediaEntry(supabase, id, body) {
  const current = await requireRecord(supabase, "media_entries", id);
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
    .select("*")
    .single();
  throwSupabaseError(error, "更新影视条目失败。", MEDIA_TITLE_UNIQUE_ERROR);
  return data;
}

export async function deleteMediaEntry(supabase, id) {
  await requireRecord(supabase, "media_entries", id, "id");
  const { error } = await supabase.from("media_entries").delete().eq("id", id);
  throwSupabaseError(error, "删除影视条目失败。");
}

export async function reorderMediaEntries(supabase, body) {
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

export async function listMediaSeasons(supabase, mediaEntryId) {
  assertCondition(UUID_PATTERN.test(mediaEntryId), 400, "INVALID_ID", "影视条目编号无效。");
  await requireRecord(supabase, "media_entries", mediaEntryId, "id");
  const { data, error } = await supabase
    .from("media_seasons")
    .select("*, media_episodes(*)")
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

export async function createMediaSeason(supabase, mediaEntryId, body) {
  assertCondition(UUID_PATTERN.test(mediaEntryId), 400, "INVALID_ID", "影视条目编号无效。");
  const name = requiredText(body.name, "季名称", 80);
  const episodeCount = integerValue(body.episode_count ?? 0, "总集数", 0, 500);
  const { data, error } = await supabase
    .rpc("create_media_season_with_episodes", {
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

export async function updateMediaSeason(supabase, id, body) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "季编号无效。");
  const name = requiredText(body.name, "季名称", 80);
  const { data, error } = await supabase
    .from("media_seasons")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新季失败。", {
    23505: { statusCode: 409, code: "MEDIA_SEASON_EXISTS", message: "这部作品中已存在同名的季。" },
  });
  return data;
}

export async function deleteMediaSeason(supabase, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "季编号无效。");
  await requireRecord(supabase, "media_seasons", id, "id");
  const { error } = await supabase.from("media_seasons").delete().eq("id", id);
  throwSupabaseError(error, "删除季失败。");
}

export async function addNextMediaEpisode(supabase, seasonId) {
  assertCondition(UUID_PATTERN.test(seasonId), 400, "INVALID_ID", "季编号无效。");
  const { data, error } = await supabase
    .rpc("add_next_media_episode", { p_season_id: seasonId })
    .single();
  throwSupabaseError(error, "增加下一集失败。", {
    P0002: { statusCode: 404, code: "MEDIA_SEASON_NOT_FOUND", message: "季不存在。" },
  });
  return data;
}

export async function getMediaEpisode(supabase, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "单集编号无效。");
  return requireRecord(supabase, "media_episodes", id);
}

export async function updateMediaEpisode(supabase, id, body) {
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
  if (body.is_favorite !== undefined) {
    changes.is_favorite = booleanValue(body.is_favorite, "喜欢标记");
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。");
  const { data, error } = await supabase
    .from("media_episodes")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新单集失败。");
  return data;
}

export async function listFavoriteMediaEpisodes(supabase, query) {
  const mediaType = requiredText(query.media_type, "影视分类", 40);
  const keyword = typeof query.keyword === "string" ? query.keyword.trim().slice(0, 80) : "";
  const { data, error } = await supabase.rpc("search_favorite_media_episodes", {
    p_media_type: mediaType,
    p_keyword: keyword,
  });
  throwSupabaseError(error, "读取喜欢的单集失败。");
  return data || [];
}

export async function listMediaCategories(supabase) {
  const { data, error } = await supabase
    .from("media_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  throwSupabaseError(error, "读取影视分类失败。");
  return data;
}

export async function getMediaCategory(supabase, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "影视分类编号无效。");
  return requireRecord(supabase, "media_categories", id);
}

export async function createMediaCategory(supabase, body) {
  const { data, error } = await supabase
    .rpc("create_media_category_at_end", { p_name: requiredText(body.name, "分类名称", 40) })
    .single();
  throwSupabaseError(error, "新增影视分类失败。", {
    23505: { statusCode: 409, code: "MEDIA_CATEGORY_EXISTS", message: "分类名称已存在。" },
  });
  return data;
}

export async function updateMediaCategory(supabase, id, body) {
  await getMediaCategory(supabase, id);
  const { data, error } = await supabase
    .from("media_categories")
    .update({ name: requiredText(body.name, "分类名称", 40) })
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新影视分类失败。", {
    23505: { statusCode: 409, code: "MEDIA_CATEGORY_EXISTS", message: "分类名称已存在。" },
  });
  return data;
}

export async function deleteMediaCategory(supabase, id) {
  const category = await getMediaCategory(supabase, id);
  const { data: entry, error: entryError } = await supabase
    .from("media_entries")
    .select("id")
    .eq("media_type", category.name)
    .limit(1)
    .maybeSingle();
  throwSupabaseError(entryError, "检查影视分类失败。");
  assertCondition(!entry, 409, "MEDIA_CATEGORY_NOT_EMPTY", "分类下还有影视条目，暂时不能删除。");
  const { error } = await supabase.from("media_categories").delete().eq("id", id);
  throwSupabaseError(error, "删除影视分类失败。");
}

export async function swapMediaCategorySortOrders(supabase, body) {
  const sourceId = typeof body.source_id === "string" ? body.source_id.trim() : "";
  const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
  assertCondition(
    UUID_PATTERN.test(sourceId) && UUID_PATTERN.test(targetId) && sourceId !== targetId,
    400,
    "INVALID_IDS",
    "请选择两个不同的影视分类。",
  );
  const { error } = await supabase.rpc("swap_media_category_sort_orders", {
    p_source_id: sourceId,
    p_target_id: targetId,
  });
  throwSupabaseError(error, "调整影视分类排序失败。", {
    P0002: { statusCode: 404, code: "MEDIA_CATEGORY_NOT_FOUND", message: "影视分类不存在。" },
  });
  return { updated: 2 };
}

export async function swapMediaEntrySortOrders(supabase, body) {
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

export async function listActivityItems(supabase, query) {
  const activityType = query.activity_type
    ? enumValue(query.activity_type, ACTIVITY_TYPES, "活动分类")
    : ACTIVITY_TYPES[0];
  let request = supabase
    .from("activity_items")
    .select("*")
    .eq("activity_type", activityType);
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("name", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取活动清单失败。");
  return data;
}

export async function createActivityItem(supabase, body) {
  const activityType = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
  const { data, error } = await supabase
    .from("activity_items")
    .insert({
      name: requiredText(body.name, "活动名称"),
      activity_type: activityType,
      sort_order: await nextSortOrder(supabase, "activity_items", {
        activity_type: activityType,
      }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增活动失败。");
  return data;
}

export async function updateActivityItem(supabase, id, body) {
  const existing = await requireRecord(
    supabase,
    "activity_items",
    id,
    "id, activity_type",
  );
  const changes = {};
  if (body.name !== undefined) changes.name = requiredText(body.name, "活动名称");
  if (body.activity_type !== undefined) {
    changes.activity_type = enumValue(body.activity_type, ACTIVITY_TYPES, "活动分类");
    if (changes.activity_type !== existing.activity_type) {
      changes.sort_order = await nextSortOrder(supabase, "activity_items", {
        activity_type: changes.activity_type,
      });
    }
  }
  assertCondition(Object.keys(changes).length > 0, 400, "NO_CHANGES", "没有需要更新的内容。" );
  const { data, error } = await supabase
    .from("activity_items")
    .update(changes)
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新活动失败。");
  return data;
}

export async function deleteActivityItem(supabase, id) {
  await requireRecord(supabase, "activity_items", id, "id");
  const { error } = await supabase.from("activity_items").delete().eq("id", id);
  throwSupabaseError(error, "删除活动失败。");
}

export async function listLuggageScenes(supabase) {
  const [sceneResult, groupResult, itemResult] = await Promise.all([
    supabase.from("luggage_scenes").select("*").order("sort_order", { ascending: true }),
    supabase.from("luggage_groups").select("*").order("sort_order", { ascending: true }),
    supabase.from("luggage_items").select("*").order("sort_order", { ascending: true }),
  ]);
  throwSupabaseError(sceneResult.error, "读取行李场景失败。");
  throwSupabaseError(groupResult.error, "读取行李层级失败。");
  throwSupabaseError(itemResult.error, "读取行李物品失败。");

  return sceneResult.data.map((scene) => ({
    ...scene,
    groups: groupResult.data
      .filter((group) => group.scene_id === scene.id)
      .map((group) => ({
        ...group,
        items: itemResult.data.filter((item) => item.group_id === group.id),
      })),
  }));
}

export async function createLuggageScene(supabase, body) {
  const name = requiredText(body.name, "场景名称", 80);
  const { data: scene, error } = await supabase
    .from("luggage_scenes")
    .insert({
      name,
      sort_order: await nextSortOrder(supabase, "luggage_scenes"),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李场景失败。");

  const { data: group, error: groupError } = await supabase
    .from("luggage_groups")
    .insert({
      scene_id: scene.id,
      name: "必备物品",
      is_required: true,
      sort_order: 1000,
    })
    .select("*")
    .single();
  if (groupError) {
    await supabase.from("luggage_scenes").delete().eq("id", scene.id);
    throwSupabaseError(groupError, "创建必备物品层级失败。");
  }
  return { ...scene, groups: [{ ...group, items: [] }] };
}

export async function updateLuggageScene(supabase, id, body) {
  await requireRecord(supabase, "luggage_scenes", id, "id");
  const { data, error } = await supabase
    .from("luggage_scenes")
    .update({ name: requiredText(body.name, "场景名称", 80) })
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李场景失败。");
  return data;
}

export async function deleteLuggageScene(supabase, id) {
  await requireRecord(supabase, "luggage_scenes", id, "id");
  const { error } = await supabase.from("luggage_scenes").delete().eq("id", id);
  throwSupabaseError(error, "删除行李场景失败。");
}

export async function createLuggageGroup(supabase, body) {
  const sceneId = requiredText(body.scene_id, "场景");
  await requireRecord(supabase, "luggage_scenes", sceneId, "id");
  const { data, error } = await supabase
    .from("luggage_groups")
    .insert({
      scene_id: sceneId,
      name: requiredText(body.name, "层级名称", 80),
      is_required: false,
      sort_order: await nextSortOrder(supabase, "luggage_groups", { scene_id: sceneId }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李层级失败。");
  return { ...data, items: [] };
}

export async function updateLuggageGroup(supabase, id, body) {
  await requireRecord(supabase, "luggage_groups", id, "id");
  const { data, error } = await supabase
    .from("luggage_groups")
    .update({ name: requiredText(body.name, "层级名称", 80) })
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李层级失败。");
  return data;
}

export async function deleteLuggageGroup(supabase, id) {
  const group = await requireRecord(supabase, "luggage_groups", id, "id, is_required");
  assertCondition(!group.is_required, 400, "REQUIRED_GROUP", "必备物品层级不能删除。" );
  const { error } = await supabase.from("luggage_groups").delete().eq("id", id);
  throwSupabaseError(error, "删除行李层级失败。");
}

export async function createLuggageItem(supabase, body) {
  const groupId = requiredText(body.group_id, "行李层级");
  await requireRecord(supabase, "luggage_groups", groupId, "id");
  const { data, error } = await supabase
    .from("luggage_items")
    .insert({
      group_id: groupId,
      name: requiredText(body.name, "物品名称"),
      sort_order: await nextSortOrder(supabase, "luggage_items", { group_id: groupId }),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增行李物品失败。");
  return data;
}

export async function updateLuggageItem(supabase, id, body) {
  await requireRecord(supabase, "luggage_items", id, "id");
  const { data, error } = await supabase
    .from("luggage_items")
    .update({ name: requiredText(body.name, "物品名称") })
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新行李物品失败。");
  return data;
}

export async function deleteLuggageItem(supabase, id) {
  await requireRecord(supabase, "luggage_items", id, "id");
  const { error } = await supabase.from("luggage_items").delete().eq("id", id);
  throwSupabaseError(error, "删除行李物品失败。");
}

export async function listDiningPlaces(supabase, query) {
  let request = supabase.from("dining_places").select("*");
  if (typeof query.keyword === "string" && query.keyword.trim()) {
    request = request.ilike("name", `%${query.keyword.trim().slice(0, 80)}%`);
  }
  const { data, error } = await request
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  throwSupabaseError(error, "读取吃什么清单失败。");
  return data;
}

export async function getDiningPlace(supabase, id) {
  assertCondition(UUID_PATTERN.test(id), 400, "INVALID_ID", "店铺编号无效。");
  return requireRecord(supabase, "dining_places", id);
}

function diningPayload(body) {
  const modes = textArray(body.service_modes || [], "用餐方式", 2);
  assertCondition(
    modes.length > 0 && modes.every((mode) => DINING_MODES.includes(mode)),
    400,
    "INVALID_DINING_MODES",
    "请至少选择一种用餐方式。",
  );
  return {
    name: requiredText(body.name, "店铺名"),
    service_modes: modes,
    menu_items: textArray(body.menu_items || [], "菜品", 100),
  };
}

export async function createDiningPlace(supabase, body) {
  const { data, error } = await supabase
    .from("dining_places")
    .insert({
      ...diningPayload(body),
      sort_order: await nextSortOrder(supabase, "dining_places"),
    })
    .select("*")
    .single();
  throwSupabaseError(error, "新增店铺失败。");
  return data;
}

export async function updateDiningPlace(supabase, id, body) {
  await requireRecord(supabase, "dining_places", id, "id");
  const { data, error } = await supabase
    .from("dining_places")
    .update(diningPayload(body))
    .eq("id", id)
    .select("*")
    .single();
  throwSupabaseError(error, "更新店铺失败。");
  return data;
}

export async function deleteDiningPlace(supabase, id) {
  await requireRecord(supabase, "dining_places", id, "id");
  const { error } = await supabase.from("dining_places").delete().eq("id", id);
  throwSupabaseError(error, "删除店铺失败。");
}

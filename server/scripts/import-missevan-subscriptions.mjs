import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const USER_ID = "3759992";
const APPLY = process.argv.includes("--apply");
const INCLUDE_LEGACY = process.argv.includes("--include-legacy");
const LEGACY_ONLY = process.argv.includes("--legacy-only");
const UPLOAD_COVERS = process.argv.includes("--upload-covers");
const MEDIA_COVER_BUCKET = "media-covers";
const PAGE_SIZE = 20;
const CONCURRENCY = 8;

const MANUAL_TITLES = new Map([
  ["fog[电竞]", "FOG"],
  ["不要在垃圾桶里捡男朋友", "不要在垃圾桶捡男朋友"],
]);

const LEGACY_SUBSCRIPTIONS = [
  { id: 71233, name: "City of Angels 全一季（旧）" },
  { id: 38218, name: "我死对头终于破产了 第一季" },
  { id: 30835, name: "飞鸥不下（旧）" },
  { id: 29165, name: "某某 第一季（旧）" },
  { id: 20071, name: "伪装学渣 第一季（旧）" },
  { id: 27309, name: "破云 第三季（旧）" },
  { id: 22282, name: "破云 第二季（旧）" },
  { id: 16635, name: "破云 第一季（旧）" },
  { id: 36679, name: "我喜欢你的信息素 第二季（旧）" },
  { id: 29119, name: "我喜欢你的信息素 第一季（旧）" },
  { id: 29129, name: "铜钱龛世 第二季（旧）" },
  { id: 28484, name: "默读 第五季（旧）" },
  { id: 25032, name: "全球高考 第一季" },
  { id: 23349, name: "默读 第四季（旧）" },
  { id: 20805, name: "默读 第三季（旧）" },
  { id: 19616, name: "默读 第二季（旧）" },
  { id: 17496, name: "默读 第一季（旧）" },
  { id: 23162, name: "撒野 第四季（旧）" },
  { id: 20228, name: "撒野 第三季（旧）" },
  { id: 12399, name: "撒野 第一季（旧）" },
  { id: 17083, name: "撒野 第二季（旧）" },
];

const MATERIAL_PATTERN = /预告|先导|主题曲|片尾曲|插曲|配乐|伴奏|花絮|福利|\bFT\b|访谈|采访|铃声|祝福|白噪音|充电音|宣言|reaction|回放|\bPV\b|发布会|倒计时|报幕|录制|主役版|纯享|OST|原声带|VLOG|制作组|幕后|生日语音|启动音|电话音|起床音|彩蛋/i;
const EXTRA_PATTERN = /番外|小剧场|剧场版|特别篇|特别放送|特供|全高考场|完结彩蛋/;
const MAIN_EPISODE_PATTERN = /第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+集/;
const MAIN_PERIOD_PATTERN = /第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+期/;
const MAIN_ALIAS_PATTERN = /^(?:正剧|楔子|序章|终章|尾声|全一期)(?:$|[·（(：:\s-])/;
const CORE_CHAPTER_PATTERN = /^(?:原罪|美德)[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+(?:$|[·（(：:\s-])/;
const SCENE_PATTERN = /^[▷▶]?Scene\s*\d+(?:$|[·（(：:\s-])/i;
const NUMBERED_TITLE_PATTERN = /^\d{1,3}[、.．·]/;
const SEASON_SUFFIX_PATTERN = /^(.*?)[\s·]*(第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+季(?:（[^）]+）)?|全一季(?:（[^）]+）)?|完结季(?:（[^）]+）)?|番外篇|独家番外|番外)$/;
const ITEM_SEASON_PATTERN = /^(第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+季)(?:[·\s丨|｜-]|$)/;

function cleanText(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u00a0\s]+/g, " ")
    .replace(/\s*·\s*/g, "·")
    .trim();
}

function matchKey(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[\s·・—_\-【】\[\]（）()《》]/g, "");
}

function parseSubscriptionName(rawName) {
  const name = cleanText(rawName);
  const match = name.match(SEASON_SUFFIX_PATTERN);
  const standaloneLegacy = !match && name.endsWith("（旧）");
  let title = match ? cleanText(match[1]) : standaloneLegacy ? cleanText(name.slice(0, -3)) : name;
  let seasonName = match ? cleanText(match[2]) : standaloneLegacy ? "旧版" : "正剧";
  const manualTitle = MANUAL_TITLES.get(title.toLocaleLowerCase());
  if (manualTitle) title = manualTitle;
  if (seasonName === "独家番外" || seasonName === "番外") seasonName = "番外篇";
  return { title, seasonName, explicitSeason: Boolean(match) || standaloneLegacy };
}

function classifyEpisode(name) {
  if (SCENE_PATTERN.test(name) || NUMBERED_TITLE_PATTERN.test(name)) return "main";
  if (EXTRA_PATTERN.test(name)) return "extra";
  if (CORE_CHAPTER_PATTERN.test(name)) return "main";
  if (MAIN_EPISODE_PATTERN.test(name)) return "main";
  if (MAIN_PERIOD_PATTERN.test(name) && !MATERIAL_PATTERN.test(name)) return "main";
  if (MAIN_ALIAS_PATTERN.test(name)) return "main";
  if (MATERIAL_PATTERN.test(name)) return "material";
  return "unknown";
}

function chineseNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digit = { 零: 0, 〇: 0, 一: 1, 壹: 1, 二: 2, 两: 2, 贰: 2, 三: 3, 叁: 3, 四: 4, 肆: 4, 五: 5, 伍: 5, 六: 6, 陆: 6, 七: 7, 柒: 7, 八: 8, 捌: 8, 九: 9, 玖: 9 };
  if (value === "十" || value === "拾") return 10;
  const separator = value.includes("十") ? "十" : value.includes("拾") ? "拾" : "";
  if (separator) {
    const [tens, ones] = value.split(separator);
    return (tens ? digit[tens] : 1) * 10 + (ones ? digit[ones] : 0);
  }
  return digit[value] || 0;
}

function seasonSortKey(name) {
  if (name === "正剧" || name === "全一季") return 0;
  const match = name.match(/第([^季]+)季/);
  if (match) {
    const part = name.includes("（下）") ? 2 : name.includes("（上）") ? 1 : 0;
    return chineseNumber(match[1]) * 10 + part;
  }
  if (name.includes("完结季")) return 900 + (name.includes("（下）") ? 2 : name.includes("（上）") ? 1 : 0);
  if (name.includes("番外")) return 1000;
  return 800;
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const headers = { Accept: "application/json" };
      if (process.env.MISSEVAN_COOKIE) headers.Cookie = process.env.MISSEVAN_COOKIE;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchSubscriptions() {
  if (LEGACY_ONLY) return [...LEGACY_SUBSCRIPTIONS];
  const first = await fetchJson(
    `https://www.missevan.com/dramaapi/getusersubscriptions?page_size=${PAGE_SIZE}&page=1&user_id=${USER_ID}`,
  );
  if (!first.success) throw new Error("读取猫耳订阅失败");
  const pages = [first];
  for (let page = 2; page <= first.info.pagination.maxpage; page += 1) {
    pages.push(await fetchJson(
      `https://www.missevan.com/dramaapi/getusersubscriptions?page_size=${PAGE_SIZE}&page=${page}&user_id=${USER_ID}`,
    ));
  }
  const subscriptions = pages.flatMap((page) => page.info.Datas || []);
  if (INCLUDE_LEGACY) subscriptions.push(...LEGACY_SUBSCRIPTIONS);
  return [...new Map(subscriptions.map((item) => [item.id, item])).values()];
}

async function fetchDrama(subscription) {
  const payload = await fetchJson(
    `https://www.missevan.com/dramaapi/getdrama?drama_id=${subscription.id}`,
  );
  if (!payload.success || !payload.info?.drama) {
    throw new Error(`读取剧集失败：${subscription.id} ${subscription.name}`);
  }
  const parsed = parseSubscriptionName(payload.info.drama.name || subscription.name);
  const sourceEpisodes = [
    ...(payload.info.episodes?.episode || []),
    ...(payload.info.episodes?.ft || []),
    ...(payload.info.episodes?.music || []),
  ].map((item, sourceOrder) => {
    const name = cleanText(item.name || item.soundstr);
    const itemSeason = !parsed.explicitSeason ? name.match(ITEM_SEASON_PATTERN)?.[1] : "";
    return {
      sourceOrder,
      sourceSoundId: item.sound_id,
      name,
      kind: classifyEpisode(name),
      seasonName: cleanText(itemSeason || parsed.seasonName),
      coverSourceUrl: payload.info.drama.cover || payload.info.drama.cover_base || subscription.cover || "",
    };
  });

  return {
    sourceId: subscription.id,
    sourceName: cleanText(payload.info.drama.name || subscription.name),
    title: parsed.title,
    defaultSeasonName: parsed.seasonName,
    inProgress: Boolean(payload.info.drama.serialize),
    episodes: sourceEpisodes,
  };
}

function buildImportPlan(dramas) {
  const worksByKey = new Map();
  for (const drama of dramas) {
    const key = matchKey(drama.title);
    if (!worksByKey.has(key)) {
      worksByKey.set(key, { key, title: drama.title, inProgress: false, seasons: new Map(), sources: [] });
    }
    const work = worksByKey.get(key);
    work.inProgress ||= drama.inProgress;
    work.sources.push({ id: drama.sourceId, name: drama.sourceName });

    const kept = drama.episodes.filter((episode) => episode.kind === "main" || episode.kind === "extra");
    for (const episode of kept) {
      const seasonName = episode.seasonName || drama.defaultSeasonName;
      const seasonKey = matchKey(seasonName);
      if (!work.seasons.has(seasonKey)) {
        work.seasons.set(seasonKey, {
          name: seasonName,
          episodes: [],
          sourceIds: new Set(),
          coverSourceUrl: episode.coverSourceUrl,
        });
      }
      const season = work.seasons.get(seasonKey);
      season.sourceIds.add(drama.sourceId);
      season.episodes.push(episode);
    }
  }

  const works = [...worksByKey.values()].map((work) => ({
    ...work,
    seasons: [...work.seasons.values()].map((season) => ({
      ...season,
      sourceIds: [...season.sourceIds],
      episodes: season.episodes
        .sort((left, right) => {
          const kindOrder = { main: 0, extra: 1 };
          return kindOrder[left.kind] - kindOrder[right.kind] || left.sourceOrder - right.sourceOrder;
        })
        .filter((episode, index, all) =>
          all.findIndex((candidate) => matchKey(candidate.name) === matchKey(episode.name)) === index
        ),
    })).sort((left, right) => seasonSortKey(left.name) - seasonSortKey(right.name)),
  }));
  return works.sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
}

async function requireSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("--apply 需要 SUPABASE_URL 和 SUPABASE_SECRET_KEY");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

async function nextMediaEntry(client, title, inProgress) {
  const result = await client.rpc("create_media_entry_at_end", {
    p_title: title,
    p_media_type: "广播剧",
    p_watch_status: inProgress ? "in_progress" : "completed",
    p_platforms: ["猫耳"],
  }).single();
  if (result.error) throw result.error;
  return result.data;
}

async function ensureSeason(client, entryId, seasonPlan) {
  let seasonResult = await client
    .from("media_seasons")
    .select("id,name,cover_url,media_episodes(id,episode_number,title,plot_summary,is_favorite)")
    .eq("media_entry_id", entryId)
    .eq("name", seasonPlan.name)
    .maybeSingle();
  if (seasonResult.error) throw seasonResult.error;

  if (!seasonResult.data) {
    const created = await client.rpc("create_media_season_with_episodes", {
      p_media_entry_id: entryId,
      p_name: seasonPlan.name,
      p_episode_count: seasonPlan.episodes.length,
    }).single();
    if (created.error) throw created.error;
    seasonResult = await client
      .from("media_seasons")
      .select("id,name,cover_url,media_episodes(id,episode_number,title,plot_summary,is_favorite)")
      .eq("id", created.data.id)
      .single();
    if (seasonResult.error) throw seasonResult.error;
  }

  const season = seasonResult.data;
  season.media_episodes.sort((a, b) => a.episode_number - b.episode_number);
  while (season.media_episodes.length < seasonPlan.episodes.length) {
    const added = await client.rpc("add_next_media_episode", { p_season_id: season.id }).single();
    if (added.error) throw added.error;
    season.media_episodes.push(added.data);
  }

  let enriched = 0;
  for (let index = 0; index < seasonPlan.episodes.length; index += 1) {
    const current = season.media_episodes[index];
    const incoming = seasonPlan.episodes[index];
    if (!current.title && incoming.name) {
      const updated = await client.from("media_episodes").update({ title: incoming.name }).eq("id", current.id);
      if (updated.error) throw updated.error;
      enriched += 1;
    }
  }
  return { id: season.id, coverUrl: season.cover_url || "", enriched };
}

async function uploadSeasonCover(client, seasonId, sourceUrl) {
  if (!sourceUrl) return "";
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`下载封面失败：HTTP ${response.status}`);
  const input = Buffer.from(await response.arrayBuffer());
  const image = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: 720, height: 720, fit: "cover", position: "attention", withoutEnlargement: true })
    .webp({ quality: 84, alphaQuality: 90 })
    .toBuffer();
  const path = `seasons/${seasonId}.webp`;
  const upload = await client.storage.from(MEDIA_COVER_BUCKET).upload(path, image, {
    cacheControl: "31536000",
    contentType: "image/webp",
    upsert: true,
  });
  if (upload.error) throw upload.error;
  return client.storage.from(MEDIA_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function applyPlan(works) {
  const client = await requireSupabase();
  const entriesResult = await client.from("media_entries").select("*").eq("media_type", "广播剧");
  if (entriesResult.error) throw entriesResult.error;
  const entriesByKey = new Map(entriesResult.data.map((entry) => [matchKey(entry.title), entry]));
  const summary = {
    createdWorks: 0,
    matchedWorks: 0,
    createdSeasons: 0,
    enrichedEpisodes: 0,
    uploadedCovers: 0,
  };

  for (const [workIndex, work] of works.entries()) {
    let entry = entriesByKey.get(work.key);
    if (!entry) {
      entry = await nextMediaEntry(client, work.title, work.inProgress);
      entriesByKey.set(work.key, entry);
      summary.createdWorks += 1;
    } else {
      summary.matchedWorks += 1;
    }

    const existingSeasons = await client.from("media_seasons").select("id,name").eq("media_entry_id", entry.id);
    if (existingSeasons.error) throw existingSeasons.error;
    const existingKeys = new Set(existingSeasons.data.map((season) => matchKey(season.name)));

    let entryCoverUrl = entry.cover_url || "";
    for (const season of work.seasons) {
      if (!existingKeys.has(matchKey(season.name))) summary.createdSeasons += 1;
      const result = await ensureSeason(client, entry.id, season);
      summary.enrichedEpisodes += result.enriched;
      if (UPLOAD_COVERS && !result.coverUrl && season.coverSourceUrl) {
        const coverUrl = await uploadSeasonCover(client, result.id, season.coverSourceUrl);
        const updatedCover = await client
          .from("media_seasons")
          .update({ cover_url: coverUrl })
          .eq("id", result.id);
        if (updatedCover.error) throw updatedCover.error;
        if (!entryCoverUrl) entryCoverUrl = coverUrl;
        summary.uploadedCovers += 1;
      } else if (!entryCoverUrl && result.coverUrl) {
        entryCoverUrl = result.coverUrl;
      }
    }
    if (entryCoverUrl && entry.cover_url !== entryCoverUrl) {
      const updatedEntryCover = await client
        .from("media_entries")
        .update({ cover_url: entryCoverUrl })
        .eq("id", entry.id);
      if (updatedEntryCover.error) throw updatedEntryCover.error;
      entry.cover_url = entryCoverUrl;
    }
    for (const [seasonIndex, season] of work.seasons.entries()) {
      const updatedOrder = await client
        .from("media_seasons")
        .update({ sort_order: (seasonIndex + 1) * 1000 })
        .eq("media_entry_id", entry.id)
        .eq("name", season.name);
      if (updatedOrder.error) throw updatedOrder.error;
    }
    console.log(`[${workIndex + 1}/${works.length}] ${entry.title}：${work.seasons.length} 个季/篇章`);
  }
  return summary;
}

const subscriptions = await fetchSubscriptions();
const dramas = await mapLimit(subscriptions, CONCURRENCY, fetchDrama);
const works = buildImportPlan(dramas);
const audit = {
  sourceSubscriptions: subscriptions.length,
  groupedWorks: works.length,
  plannedSeasons: works.reduce((sum, work) => sum + work.seasons.length, 0),
  plannedEpisodes: works.reduce(
    (sum, work) => sum + work.seasons.reduce((seasonSum, season) => seasonSum + season.episodes.length, 0),
    0,
  ),
  skippedMaterials: dramas.reduce(
    (sum, drama) => sum + drama.episodes.filter((episode) => episode.kind === "material").length,
    0,
  ),
  skippedUnknown: dramas.reduce(
    (sum, drama) => sum + drama.episodes.filter((episode) => episode.kind === "unknown").length,
    0,
  ),
  emptySources: dramas
    .filter((drama) => !drama.episodes.some((episode) => episode.kind === "main" || episode.kind === "extra"))
    .map((drama) => ({ id: drama.sourceId, name: drama.sourceName })),
  seasonCollisions: works.flatMap((work) => work.seasons
    .filter((season) => season.sourceIds.length > 1)
    .map((season) => ({ work: work.title, season: season.name, sourceIds: season.sourceIds }))),
  multiSourceWorks: works
    .filter((work) => work.sources.length > 1)
    .map((work) => ({
      title: work.title,
      sources: work.sources.map((source) => source.name),
      seasons: work.seasons.map((season) => `${season.name}(${season.episodes.length})`),
    })),
  lowCountSeasons: works.flatMap((work) => work.seasons
    .filter((season) => season.episodes.length < 5)
    .map((season) => ({ title: work.title, season: season.name, count: season.episodes.length }))),
};

const reportedAudit = APPLY ? {
  sourceSubscriptions: audit.sourceSubscriptions,
  groupedWorks: audit.groupedWorks,
  plannedSeasons: audit.plannedSeasons,
  plannedEpisodes: audit.plannedEpisodes,
  skippedMaterials: audit.skippedMaterials,
  skippedUnknown: audit.skippedUnknown,
  emptySources: audit.emptySources,
  seasonCollisions: audit.seasonCollisions,
} : audit;
console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", audit: reportedAudit }, null, 2));
if (APPLY) {
  const summary = await applyPlan(works);
  console.log(JSON.stringify({ applied: true, summary }, null, 2));
}

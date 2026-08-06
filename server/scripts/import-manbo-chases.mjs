import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const UPLOAD_COVERS = process.argv.includes("--upload-covers");
const CDP_URL = process.env.MANBO_CDP_URL || "http://127.0.0.1:9222";
const MEDIA_COVER_BUCKET = "media-covers";

const MATERIAL_PATTERN = /预告|先导|主题曲|片尾曲|插曲|配乐|伴奏|花絮|福利|\bFT\b|访谈|采访|铃声|祝福|白噪音|充电音|宣言|reaction|回放|\bPV\b|发布会|倒计时|报幕|录制|纯享|OST|原声带|VLOG|幕后|生日语音|动态|宣传|声展|探班|角色彩蛋|开播前采|创作分享|节气|唤醒|呢喃|衷情|归宿|早安|哄睡|喝水提醒|国际.*小贴士|兰波小课堂|特别掉落/i;
const EXTRA_PATTERN = /番外|小剧场|剧场版|特别篇|特别放送|特供/;
const NUMBERED_MAIN_PATTERN = /(?:^\d{1,3}(?:\s|[、.．·])|(?:^|[·•\s-])第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+[集期])/;
const SEASON_SUFFIX_PATTERN = /^(.*?)[\s·•・]*(第[零〇一二两三四五六七八九十百壹贰叁肆伍陆柒捌玖拾\d]+季)$/;

function cleanText(value) {
  return String(value || "").replace(/[\u00a0\s]+/g, " ").trim();
}

function matchKey(value) {
  return cleanText(value)
    .toLocaleLowerCase()
    .replace(/[\s·•・—_\-【】\[\]（）()《》]/g, "");
}

function parseDramaTitle(rawTitle) {
  const title = cleanText(rawTitle);
  const match = title.match(SEASON_SUFFIX_PATTERN);
  if (match) return { title: cleanText(match[1]), seasonName: cleanText(match[2]) };
  if (title === "靡言有声剧") return { title: "靡言", seasonName: "正剧" };
  return { title, seasonName: "正剧" };
}

function classifyEpisode(title) {
  if (EXTRA_PATTERN.test(title)) return "extra";
  if (NUMBERED_MAIN_PATTERN.test(title)) return "main";
  if (MATERIAL_PATTERN.test(title)) return "material";
  return "unknown";
}

function seasonSortKey(name) {
  if (name === "正剧") return 0;
  const digits = name.match(/第(\d+)季/);
  if (digits) return Number(digits[1]);
  const chinese = "一二三四五六七八九十";
  const match = name.match(/第([一二三四五六七八九十])季/);
  if (match) return chinese.indexOf(match[1]) + 1;
  return 1000;
}

async function cdpEvaluate(expression) {
  const pagesResponse = await fetch(`${CDP_URL}/json/list`);
  if (!pagesResponse.ok) throw new Error("无法连接专用浏览器，请重新打开漫播登录窗口。");
  const pages = await pagesResponse.json();
  const page = pages.find((item) => item.type === "page" && item.url.includes("kilamanbo.world"));
  if (!page?.webSocketDebuggerUrl) throw new Error("专用浏览器中没有找到漫播页面。");

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  try {
    const response = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("读取漫播数据超时。")), 60_000);
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== 1) return;
        clearTimeout(timer);
        resolve(message);
      });
      socket.send(JSON.stringify({
        id: 1,
        method: "Runtime.evaluate",
        params: { expression, awaitPromise: true, returnByValue: true },
      }));
    });
    if (response.result?.exceptionDetails) throw new Error("漫播页面执行读取请求失败。");
    return response.result?.result?.value;
  } finally {
    socket.close();
  }
}

async function fetchChasedDramas() {
  const expression = `(async () => {
    const list = await fetch('/web_manbo/myChaseDrama?page=1&pageSize=1000', { credentials: 'include' }).then(r => r.json());
    if (list.code !== 200) throw new Error(list.msg || '读取追剧列表失败');
    const dramas = await Promise.all((list.data.collectData || []).map(async item => {
      const summary = item.radioDramaResp;
      const detail = await fetch('/web_manbo/dramaDetail?dramaId=' + encodeURIComponent(summary.radioDramaIdStr), { credentials: 'include' }).then(r => r.json());
      if (detail.code !== 200) throw new Error(detail.msg || '读取剧集详情失败');
      return detail.data;
    }));
    return JSON.stringify({ collectCount: list.data.collectCount, dramas });
  })()`;
  const serialized = await cdpEvaluate(expression);
  if (!serialized) throw new Error("漫播没有返回追剧数据，请确认已经登录。");
  return JSON.parse(serialized);
}

function buildImportPlan(source) {
  const worksByKey = new Map();
  const auditSources = [];
  for (const drama of source.dramas) {
    const parsed = parseDramaTitle(drama.title);
    const workKey = matchKey(parsed.title);
    if (!worksByKey.has(workKey)) {
      worksByKey.set(workKey, {
        key: workKey,
        title: parsed.title,
        inProgress: false,
        seasons: new Map(),
      });
    }
    const work = worksByKey.get(workKey);
    work.inProgress ||= drama.endStatus !== 1;
    const seasonKey = matchKey(parsed.seasonName);
    if (!work.seasons.has(seasonKey)) {
      work.seasons.set(seasonKey, {
        name: parsed.seasonName,
        coverSourceUrl: drama.coverPic || "",
        episodes: [],
        sourceTitles: [],
      });
    }
    const season = work.seasons.get(seasonKey);
    season.sourceTitles.push(drama.title);
    const classified = (drama.setRespList || []).map((episode, sourceOrder) => {
      const name = cleanText(episode.setTitle || episode.setName).slice(0, 120);
      return { name, sourceOrder, kind: classifyEpisode(name) };
    });
    season.episodes.push(...classified.filter((episode) => episode.kind === "main" || episode.kind === "extra"));
    auditSources.push({
      title: drama.title,
      total: classified.length,
      imported: classified.filter((episode) => episode.kind === "main" || episode.kind === "extra").length,
      skippedMaterials: classified.filter((episode) => episode.kind === "material").length,
      skippedUnknown: classified.filter((episode) => episode.kind === "unknown").map((episode) => episode.name),
    });
  }

  const works = [...worksByKey.values()].map((work) => ({
    ...work,
    seasons: [...work.seasons.values()].map((season) => ({
      ...season,
      episodes: season.episodes
        .sort((left, right) => {
          const order = { main: 0, extra: 1 };
          return order[left.kind] - order[right.kind] || left.sourceOrder - right.sourceOrder;
        })
        .filter((episode, index, all) =>
          all.findIndex((candidate) => matchKey(candidate.name) === matchKey(episode.name)) === index
        ),
    })).sort((left, right) => seasonSortKey(left.name) - seasonSortKey(right.name)),
  })).sort((left, right) => left.title.localeCompare(right.title, "zh-CN"));
  return { works, auditSources };
}

function requireSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
    throw new Error("--apply 需要 SUPABASE_URL 和 SUPABASE_SECRET_KEY");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false },
  });
}

async function createMediaEntry(client, work) {
  const result = await client.rpc("create_media_entry_at_end", {
    p_title: work.title,
    p_media_type: "广播剧",
    p_watch_status: work.inProgress ? "in_progress" : "completed",
    p_platforms: ["漫播"],
  }).single();
  if (result.error) throw result.error;
  return result.data;
}

function resolveSeasonName(seasonName, existingSeasons, entryPlatforms) {
  const names = new Set(existingSeasons.map((season) => matchKey(season.name)));
  const desiredKey = matchKey(seasonName);
  const alternative = seasonName === "正剧" ? "漫播版" : `漫播·${seasonName}`;
  if (names.has(matchKey(alternative))) return alternative;
  if (names.has(desiredKey) && !entryPlatforms.includes("漫播")) return alternative;
  return seasonName;
}

async function ensureSeason(client, entryId, seasonPlan) {
  let result = await client
    .from("media_seasons")
    .select("id,name,cover_url,media_episodes(id,episode_number,title,plot_summary,is_favorite)")
    .eq("media_entry_id", entryId)
    .eq("name", seasonPlan.name)
    .maybeSingle();
  if (result.error) throw result.error;
  let created = false;
  if (!result.data) {
    const inserted = await client.rpc("create_media_season_with_episodes", {
      p_media_entry_id: entryId,
      p_name: seasonPlan.name,
      p_episode_count: seasonPlan.episodes.length,
    }).single();
    if (inserted.error) throw inserted.error;
    created = true;
    result = await client
      .from("media_seasons")
      .select("id,name,cover_url,media_episodes(id,episode_number,title,plot_summary,is_favorite)")
      .eq("id", inserted.data.id)
      .single();
    if (result.error) throw result.error;
  }

  const season = result.data;
  season.media_episodes.sort((left, right) => left.episode_number - right.episode_number);
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
  return { id: season.id, coverUrl: season.cover_url || "", created, enriched };
}

async function uploadSeasonCover(client, seasonId, sourceUrl) {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`下载封面失败：HTTP ${response.status}`);
  const image = await sharp(Buffer.from(await response.arrayBuffer()), { failOn: "error" })
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
  const client = requireSupabase();
  const entriesResult = await client.from("media_entries").select("*").eq("media_type", "广播剧");
  if (entriesResult.error) throw entriesResult.error;
  const entriesByKey = new Map(entriesResult.data.map((entry) => [matchKey(entry.title), entry]));
  const summary = { createdWorks: 0, matchedWorks: 0, createdSeasons: 0, enrichedEpisodes: 0, uploadedCovers: 0 };

  for (const [workIndex, work] of works.entries()) {
    let entry = entriesByKey.get(work.key);
    if (!entry) {
      entry = await createMediaEntry(client, work);
      entriesByKey.set(work.key, entry);
      summary.createdWorks += 1;
    } else {
      summary.matchedWorks += 1;
    }
    const originalPlatforms = [...(entry.platforms || [])];
    let seasonsResult = await client.from("media_seasons").select("id,name,cover_url").eq("media_entry_id", entry.id);
    if (seasonsResult.error) throw seasonsResult.error;
    let entryCoverUrl = entry.cover_url || "";

    for (const [seasonIndex, sourceSeason] of work.seasons.entries()) {
      const season = {
        ...sourceSeason,
        name: resolveSeasonName(sourceSeason.name, seasonsResult.data, originalPlatforms),
      };
      const ensured = await ensureSeason(client, entry.id, season);
      if (ensured.created) {
        summary.createdSeasons += 1;
        seasonsResult.data.push({ id: ensured.id, name: season.name, cover_url: "" });
      }
      summary.enrichedEpisodes += ensured.enriched;
      let seasonCoverUrl = ensured.coverUrl;
      if (UPLOAD_COVERS && !seasonCoverUrl && season.coverSourceUrl) {
        seasonCoverUrl = await uploadSeasonCover(client, ensured.id, season.coverSourceUrl);
        const coverUpdate = await client.from("media_seasons").update({ cover_url: seasonCoverUrl }).eq("id", ensured.id);
        if (coverUpdate.error) throw coverUpdate.error;
        summary.uploadedCovers += 1;
      }
      if (!entryCoverUrl && seasonCoverUrl) entryCoverUrl = seasonCoverUrl;
      const orderUpdate = await client
        .from("media_seasons")
        .update({ sort_order: (seasonsResult.data.length + seasonIndex + 1) * 1000 })
        .eq("id", ensured.id);
      if (orderUpdate.error) throw orderUpdate.error;
    }

    const platforms = [...new Set([...originalPlatforms, "漫播"])];
    const entryChanges = {};
    if (platforms.length !== originalPlatforms.length) entryChanges.platforms = platforms;
    if (!entry.cover_url && entryCoverUrl) entryChanges.cover_url = entryCoverUrl;
    if (Object.keys(entryChanges).length) {
      const updated = await client.from("media_entries").update(entryChanges).eq("id", entry.id);
      if (updated.error) throw updated.error;
    }
    console.log(`[${workIndex + 1}/${works.length}] ${work.title}：${work.seasons.length} 个季/版本`);
  }
  return summary;
}

const source = await fetchChasedDramas();
const { works, auditSources } = buildImportPlan(source);
const audit = {
  chasedEntries: source.collectCount,
  fetchedEntries: source.dramas.length,
  groupedWorks: works.length,
  plannedSeasons: works.reduce((sum, work) => sum + work.seasons.length, 0),
  plannedEpisodes: works.reduce((sum, work) => sum + work.seasons.reduce((total, season) => total + season.episodes.length, 0), 0),
  works: works.map((work) => ({
    title: work.title,
    seasons: work.seasons.map((season) => `${season.name}(${season.episodes.length})`),
  })),
  sources: auditSources,
};
console.log(JSON.stringify({ mode: APPLY ? "apply" : "dry-run", audit }, null, 2));
if (APPLY) {
  const summary = await applyPlan(works);
  console.log(JSON.stringify({ applied: true, summary }, null, 2));
}

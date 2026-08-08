import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const APPLY = process.argv.includes("--apply");
const PREVIEW_DIR = process.argv
  .find((argument) => argument.startsWith("--preview-dir="))
  ?.slice("--preview-dir=".length);
const MEDIA_COVER_BUCKET = "media-covers";

const RECORD_CORRECTIONS = [
  {
    fromTitle: "SA ·特优生",
    fromMediaType: "动画片",
    toTitle: "S·A特优生",
    toMediaType: "动画片",
    reason: "按豆瓣正式片名修正字母、间隔与分隔符",
  },
  {
    fromTitle: "岚的新生活",
    fromMediaType: "电视剧",
    toTitle: "凪的新生活",
    toMediaType: "电视剧",
    reason: "修正日文汉字误写",
  },
  {
    fromTitle: "凡人修仙传：风起天南",
    fromMediaType: "动画片",
    toTitle: "凡人修仙传",
    toMediaType: "动画片",
    reason: "条目聚合哔哩哔哩全部篇章，名称不再限定为风起天南",
    optional: true,
  },
  {
    fromTitle: "斗罗大陆",
    fromMediaType: "动画片",
    toTitle: "斗罗大陆1 第一季",
    toMediaType: "动画片",
    reason: "按豆瓣主条目补全第一季正式名称",
  },
  {
    fromTitle: "牧神记 年番1",
    fromMediaType: "动画片",
    toTitle: "牧神记",
    toMediaType: "动画片",
    reason: "按哔哩哔哩聚合条目恢复作品总名",
    optional: true,
  },
  {
    fromTitle: "神探夏洛克",
    fromMediaType: "电影",
    toTitle: "神探夏洛克",
    toMediaType: "电视剧",
    reason: "将整部剧的聚合记录修正为电视剧分类",
    optional: true,
  },
  {
    fromTitle: "神探夏洛克 第一季",
    fromMediaType: "电视剧",
    toTitle: "神探夏洛克",
    toMediaType: "电视剧",
    reason: "条目聚合四季，名称不再限定为第一季",
    optional: true,
  },
  {
    fromTitle: "知否",
    fromMediaType: "电视剧",
    toTitle: "知否知否应是绿肥红瘦",
    toMediaType: "电视剧",
    reason: "按豆瓣主条目补全正式剧名",
  },
  {
    fromTitle: "咒术回战 第一季",
    fromMediaType: "动画片",
    toTitle: "咒术回战",
    toMediaType: "动画片",
    reason: "条目聚合哔哩哔哩全部季，名称不再限定为第一季",
    optional: true,
  },
  {
    fromTitle: "甄嬛传",
    fromMediaType: "电视剧",
    toTitle: "后宫·甄嬛传",
    toMediaType: "电视剧",
    reason: "按豆瓣主条目补全正式剧名",
  },
];

const COVER_PLANS = [
  {
    title: "S·A特优生",
    mediaType: "动画片",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2628785515.jpg",
    sourcePage: "https://movie.douban.com/subject/3035537/",
  },
  {
    title: "元气少女缘结神",
    mediaType: "动画片",
    sourceUrl: "https://img3.doubanio.com/view/photo/l/public/p1669678053.jpg",
    sourcePage: "https://movie.douban.com/subject/10877415/",
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2610801866.jpg",
    sourcePage: "https://movie.douban.com/photos/photo/2610801866/",
  },
  {
    title: "咒术回战",
    mediaType: "动画片",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2620216005.jpg",
    sourcePage: "https://movie.douban.com/subject/34895145/",
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    sourceUrl: "https://img2.doubanio.com/view/photo/l/public/p2221083211.jpg",
    sourcePage: "https://movie.douban.com/subject/3060542/",
  },
  {
    title: "工作细胞",
    mediaType: "动画片",
    sourceUrl: "https://img3.doubanio.com/view/photo/l/public/p2554946003.jpg",
    sourcePage: "https://movie.douban.com/subject/28514091/",
  },
  {
    title: "排球少年",
    mediaType: "动画片",
    sourceUrl: "https://img2.doubanio.com/view/photo/l/public/p2178189911.jpg",
    sourcePage: "https://movie.douban.com/subject/25732103/",
  },
  {
    title: "斗罗大陆1 第一季",
    mediaType: "动画片",
    sourceUrl: "https://img3.doubanio.com/view/photo/l/public/p2510966013.jpg",
    sourcePage: "https://movie.douban.com/subject/27040807/",
  },
  {
    title: "牧神记",
    mediaType: "动画片",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2916595576.jpg",
    sourcePage: "https://movie.douban.com/subject/36576581/",
  },
  {
    title: "罗小黑战记",
    mediaType: "动画片",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2496903956.jpg",
    sourcePage: "https://movie.douban.com/subject/10477598/",
  },
  {
    title: "致不灭的你",
    mediaType: "动画片",
    sourceUrl: "https://i0.hdslb.com/bfs/bangumi/image/1ae94fbb35d8e23bb84926b694509f8b057f96e6.png",
    sourcePage: "https://www.bilibili.com/bangumi/media/md28233896",
  },
  {
    title: "时间游戏",
    mediaType: "书籍",
    sourceUrl: "https://img3.doubanio.com/view/subject/l/public/s34871227.jpg",
    sourcePage: "https://book.douban.com/subject/36905188/",
  },
  {
    title: "金钱心理学",
    mediaType: "书籍",
    sourceUrl: "https://img9.doubanio.com/view/subject/l/public/s34540496.jpg",
    sourcePage: "https://book.douban.com/subject/36415996/",
  },
  {
    title: "小潭山没有天文台",
    mediaType: "广播剧",
    sourceUrl: "https://img.kilamanbo.com/h5/1785751630587706.jpg",
    sourcePage: "https://www.kilamanbo.world/manbo/pc/detail?id=1755103514939359249",
  },
  {
    title: "天官赐福",
    mediaType: "漫画",
    sourceUrl: "https://img9.doubanio.com/view/subject/l/public/s34218036.jpg",
    sourcePage: "https://book.douban.com/subject/35898234/",
  },
  {
    title: "哈尔的移动城堡",
    mediaType: "电影",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2907583906.jpg",
    sourcePage: "https://movie.douban.com/subject/1308807/",
  },
  {
    title: "因果报应",
    mediaType: "电影",
    sourceUrl: "https://img1.doubanio.com/view/photo/l/public/p2915350868.jpg",
    sourcePage: "https://movie.douban.com/subject/36934908/",
  },
  {
    title: "疯狂动物城",
    mediaType: "电影",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2924128964.jpg",
    sourcePage: "https://movie.douban.com/subject/25662329/",
  },
  {
    title: "神探夏洛克",
    mediaType: "电视剧",
    sourceUrl: "https://img3.doubanio.com/view/photo/l/public/p1461954452.jpg",
    sourcePage: "https://movie.douban.com/subject/3986493/",
  },
  {
    title: "罗小黑战记",
    mediaType: "电影",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2568288336.jpg",
    sourcePage: "https://movie.douban.com/subject/26709258/",
  },
  {
    title: "凪的新生活",
    mediaType: "电视剧",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2729144005.jpg",
    sourcePage: "https://movie.douban.com/subject/33418567/",
  },
  {
    title: "后宫·甄嬛传",
    mediaType: "电视剧",
    sourceUrl: "https://img3.doubanio.com/view/photo/l/public/p1480046723.jpg",
    sourcePage: "https://movie.douban.com/subject/4922787/",
  },
  {
    title: "眼泪女王",
    mediaType: "电视剧",
    sourceUrl: "https://img9.doubanio.com/view/photo/l/public/p2905107716.jpg",
    sourcePage: "https://movie.douban.com/subject/35861696/",
  },
  {
    title: "知否知否应是绿肥红瘦",
    mediaType: "电视剧",
    sourceUrl: "https://img1.doubanio.com/view/photo/l/public/p2537131688.jpg",
    sourcePage: "https://movie.douban.com/subject/26928226/",
  },
];

const EPISODE_PLANS = [
  {
    title: "S·A特优生",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 24,
    sourcePage: "https://movie.douban.com/subject/3035537/",
  },
  {
    title: "元气少女缘结神",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 13,
    sourcePage: "https://movie.douban.com/subject/10877415/",
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "风起天南",
    episodeCount: 17,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "燕家堡之战",
    episodeCount: 4,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "魔道争锋",
    episodeCount: 25,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "再别天南",
    episodeCount: 14,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "初入星海",
    episodeCount: 12,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "星海飞驰序章",
    episodeCount: 4,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "星海飞驰",
    episodeCount: 48,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "外海风云",
    episodeCount: 28,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "重返天南",
    episodeCount: 24,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "凡人修仙传",
    mediaType: "动画片",
    seasonName: "慕兰之战",
    episodeCount: 9,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss28747",
    allowAdditionalSeason: true,
  },
  {
    title: "咒术回战",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 24,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss34430",
  },
  {
    title: "咒术回战",
    mediaType: "动画片",
    seasonName: "第二季",
    episodeCount: 23,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss45574",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss1660",
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第二季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss1661",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第三季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss1662",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第四季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss1663",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第五季",
    episodeCount: 11,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss5550",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第六季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss5977",
    allowAdditionalSeason: true,
  },
  {
    title: "夏目友人帐",
    mediaType: "动画片",
    seasonName: "第七季",
    episodeCount: 13,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss48811",
    allowAdditionalSeason: true,
  },
  {
    title: "工作细胞",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 14,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss24588",
  },
  {
    title: "工作细胞",
    mediaType: "动画片",
    seasonName: "第二季",
    episodeCount: 8,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss36174",
    allowAdditionalSeason: true,
  },
  {
    title: "排球少年",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 25,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss2727",
  },
  {
    title: "排球少年",
    mediaType: "动画片",
    seasonName: "第二季",
    episodeCount: 25,
    sourcePage: "https://movie.douban.com/subject/26285156/",
    allowAdditionalSeason: true,
  },
  {
    title: "排球少年",
    mediaType: "动画片",
    seasonName: "第三季",
    episodeCount: 10,
    sourcePage: "https://www.bilibili.com/bangumi/play/ep277947",
    allowAdditionalSeason: true,
  },
  {
    title: "排球少年",
    mediaType: "动画片",
    seasonName: "第四季",
    episodeCount: 25,
    sourcePage: "https://haikyu.jp/season4/",
    allowAdditionalSeason: true,
  },
  {
    title: "斗罗大陆1 第一季",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 26,
    sourcePage: "https://movie.douban.com/subject/27040807/",
  },
  {
    title: "牧神记",
    mediaType: "动画片",
    seasonName: "动画",
    episodeCount: 94,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss45969",
    previousSeasonName: "年番1",
  },
  {
    title: "罗小黑战记",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 43,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss1733",
    previousSeasonName: "正剧",
  },
  {
    title: "致不灭的你",
    mediaType: "动画片",
    seasonName: "第一季",
    episodeCount: 20,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss38214",
  },
  {
    title: "致不灭的你",
    mediaType: "动画片",
    seasonName: "第二季",
    episodeCount: 20,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss43148",
    allowAdditionalSeason: true,
  },
  {
    title: "致不灭的你",
    mediaType: "动画片",
    seasonName: "第三季",
    episodeCount: 8,
    sourcePage: "https://www.bilibili.com/bangumi/play/ss113506",
    allowAdditionalSeason: true,
  },
  {
    title: "小潭山没有天文台",
    mediaType: "广播剧",
    seasonName: "正剧",
    episodeCount: 87,
    sourcePage: "https://www.kilamanbo.world/manbo/pc/detail?id=1755103514939359249",
  },
  {
    title: "神探夏洛克",
    mediaType: "电视剧",
    seasonName: "第一季",
    episodeCount: 3,
    sourcePage: "https://movie.douban.com/subject/3986493/",
  },
  {
    title: "神探夏洛克",
    mediaType: "电视剧",
    seasonName: "第二季",
    episodeCount: 3,
    sourcePage: "https://movie.douban.com/subject/6522269/",
    allowAdditionalSeason: true,
  },
  {
    title: "神探夏洛克",
    mediaType: "电视剧",
    seasonName: "第三季",
    episodeCount: 3,
    sourcePage: "https://movie.douban.com/subject/10455629/",
    allowAdditionalSeason: true,
  },
  {
    title: "神探夏洛克",
    mediaType: "电视剧",
    seasonName: "第四季",
    episodeCount: 3,
    sourcePage: "https://movie.douban.com/subject/25750923/",
    allowAdditionalSeason: true,
  },
  {
    title: "凪的新生活",
    mediaType: "电视剧",
    seasonName: "正剧",
    episodeCount: 10,
    sourcePage: "https://movie.douban.com/subject/33418567/",
  },
  {
    title: "后宫·甄嬛传",
    mediaType: "电视剧",
    seasonName: "正剧",
    episodeCount: 76,
    sourcePage: "https://movie.douban.com/subject/4922787/",
  },
  {
    title: "眼泪女王",
    mediaType: "电视剧",
    seasonName: "正剧",
    episodeCount: 16,
    sourcePage: "https://movie.douban.com/subject/35861696/",
  },
  {
    title: "知否知否应是绿肥红瘦",
    mediaType: "电视剧",
    seasonName: "正剧",
    episodeCount: 78,
    sourcePage: "https://movie.douban.com/subject/26928226/",
  },
];

const SEASON_RENAME_PLANS = [
  {
    title: "牧神记",
    mediaType: "动画片",
    fromSeasonName: "年番1",
    toSeasonName: "动画",
    reason: "按哔哩哔哩当前分组名称修正",
  },
  {
    title: "罗小黑战记",
    mediaType: "动画片",
    fromSeasonName: "正剧",
    toSeasonName: "第一季",
    reason: "按哔哩哔哩系列分组名称修正",
  },
];

const ATTRIBUTE_PLANS = [
  {
    title: "时间游戏",
    mediaType: "书籍",
    fromPlatforms: ["待定"],
    toPlatforms: ["Books"],
    reason: "书籍记录使用现有 Books 平台标识",
  },
  {
    title: "金钱心理学",
    mediaType: "书籍",
    fromPlatforms: ["待定"],
    toPlatforms: ["Books"],
    reason: "书籍记录使用现有 Books 平台标识",
  },
];

function requireRuntimeConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || "";
  const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const allowedOpenIds = new Set(
    (process.env.WECHAT_ALLOWED_OPENIDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  if (!supabaseUrl || !supabaseKey || !allowedOpenIds.size) {
    throw new Error("缺少 Supabase 或可写账号配置。");
  }
  return { supabaseUrl, supabaseKey, allowedOpenIds };
}

async function findWriterAccount(client, allowedOpenIds) {
  const { data, error } = await client.from("app_users").select("id,wechat_openid");
  if (error) throw error;
  const writers = (data || []).filter((user) => allowedOpenIds.has(user.wechat_openid));
  if (writers.length !== 1) {
    throw new Error(`预期找到 1 个可写账号，实际找到 ${writers.length} 个。`);
  }
  return writers[0].id;
}

async function downloadCover(plan) {
  const response = await fetch(plan.sourceUrl, {
    headers: {
      Referer: plan.sourcePage,
      "User-Agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`${plan.title} 下载失败：HTTP ${response.status}`);
  }
  const source = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(source, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`${plan.title} 不是有效图片。`);
  }
  const uprightSource = await sharp(source, { failOn: "error" }).rotate().toBuffer();
  const background = await sharp(uprightSource)
    .resize({ width: 720, height: 960, fit: "cover", position: "attention" })
    .blur(28)
    .modulate({ brightness: 0.82, saturation: 0.78 })
    .toBuffer();
  const foreground = await sharp(uprightSource)
    .resize({
      width: 720,
      height: 960,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const image = await sharp(background)
    .composite([{ input: foreground }])
    .rotate()
    .webp({ quality: 86, alphaQuality: 90 })
    .toBuffer();
  return {
    image,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
  };
}

function xmlEscape(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}

function safeFilename(value) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

async function writePreview(previews) {
  if (!PREVIEW_DIR || !previews.length) return "";
  await mkdir(PREVIEW_DIR, { recursive: true });
  const columns = 5;
  const tileWidth = 200;
  const tileHeight = 300;
  const posterWidth = 180;
  const posterHeight = 240;
  const rows = Math.ceil(previews.length / columns);
  const composites = [];

  for (const [index, preview] of previews.entries()) {
    const filename = `${String(index + 1).padStart(2, "0")}-${safeFilename(preview.mediaType)}-${safeFilename(preview.title)}.webp`;
    await sharp(preview.image).toFile(path.join(PREVIEW_DIR, filename));
    const column = index % columns;
    const row = Math.floor(index / columns);
    composites.push({
      input: await sharp(preview.image).resize(posterWidth, posterHeight).toBuffer(),
      left: column * tileWidth + 10,
      top: row * tileHeight + 10,
    });
    const caption = `${preview.mediaType} · ${preview.title}`;
    composites.push({
      input: Buffer.from(`<svg width="${tileWidth}" height="42">
        <text x="${tileWidth / 2}" y="19" text-anchor="middle"
          font-family="PingFang SC, sans-serif" font-size="14" fill="#2d2925">${xmlEscape(caption)}</text>
      </svg>`),
      left: column * tileWidth,
      top: row * tileHeight + 254,
    });
  }

  const sheetPath = path.join(PREVIEW_DIR, "豆瓣封面预览.jpg");
  await sharp({
    create: {
      width: columns * tileWidth,
      height: rows * tileHeight,
      channels: 3,
      background: "#f5f2ed",
    },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(sheetPath);
  return sheetPath;
}

function buildCorrectedEntries(entries) {
  return entries.map((entry) => {
    const correction = RECORD_CORRECTIONS.find(
      (candidate) => candidate.fromTitle === entry.title
        && candidate.fromMediaType === entry.media_type,
    );
    return correction
      ? { ...entry, title: correction.toTitle, media_type: correction.toMediaType }
      : entry;
  });
}

async function applyRecordCorrections(client, userId, entries) {
  const results = [];
  for (const correction of RECORD_CORRECTIONS) {
    const matches = entries.filter(
      (entry) => entry.title === correction.fromTitle
        && entry.media_type === correction.fromMediaType,
    );
    const correctedMatches = entries.filter(
      (entry) => entry.title === correction.toTitle
        && entry.media_type === correction.toMediaType,
    );
    if (matches.length === 0 && correctedMatches.length === 1) {
      results.push({
        from: `${correction.fromMediaType}《${correction.fromTitle}》`,
        to: `${correction.toMediaType}《${correction.toTitle}》`,
        reason: correction.reason,
        status: "已是正确值",
      });
      continue;
    }
    if (correction.optional && matches.length === 0 && correctedMatches.length === 0) {
      results.push({
        from: `${correction.fromMediaType}《${correction.fromTitle}》`,
        to: `${correction.toMediaType}《${correction.toTitle}》`,
        reason: correction.reason,
        status: "当前记录无需处理",
      });
      continue;
    }
    if (matches.length !== 1 || correctedMatches.length !== 0) {
      throw new Error(
        `${correction.fromMediaType}《${correction.fromTitle}》匹配到 ${matches.length} 条待修正记录，`
          + `${correction.toMediaType}《${correction.toTitle}》匹配到 ${correctedMatches.length} 条正确记录。`,
      );
    }
    if (APPLY) {
      let update;
      if (correction.fromMediaType === correction.toMediaType) {
        update = await client
          .from("media_entries")
          .update({ title: correction.toTitle })
          .eq("id", matches[0].id)
          .eq("user_id", userId)
          .eq("title", correction.fromTitle)
          .eq("media_type", correction.fromMediaType)
          .select("id")
          .single();
      } else {
        update = await client
          .rpc("move_media_entry_to_type_at_end", {
            p_user_id: userId,
            p_entry_id: matches[0].id,
            p_title: correction.toTitle,
            p_media_type: correction.toMediaType,
            p_watch_status: null,
            p_platforms: null,
          })
          .single();
      }
      if (update.error) throw update.error;
    }
    results.push({
      from: `${correction.fromMediaType}《${correction.fromTitle}》`,
      to: `${correction.toMediaType}《${correction.toTitle}》`,
      reason: correction.reason,
      status: APPLY ? "已修正" : "待修正",
    });
  }
  return results;
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function findExactEntry(entries, title, mediaType) {
  const matches = entries.filter(
    (entry) => entry.title === title && entry.media_type === mediaType,
  );
  if (matches.length !== 1) {
    throw new Error(`${mediaType}《${title}》匹配到 ${matches.length} 条记录。`);
  }
  return matches[0];
}

async function applyAttributePlans(client, userId, entries) {
  const results = [];
  for (const plan of ATTRIBUTE_PLANS) {
    const entry = findExactEntry(entries, plan.title, plan.mediaType);
    const currentPlatforms = Array.isArray(entry.platforms) ? entry.platforms : [];
    if (arraysEqual(currentPlatforms, plan.toPlatforms)) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        field: "platforms",
        value: plan.toPlatforms,
        status: "已是正确值",
      });
      continue;
    }
    if (!arraysEqual(currentPlatforms, plan.fromPlatforms)) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        field: "platforms",
        value: currentPlatforms,
        status: "保留现有值",
      });
      continue;
    }
    if (APPLY) {
      const update = await client
        .from("media_entries")
        .update({ platforms: plan.toPlatforms })
        .eq("id", entry.id)
        .eq("user_id", userId)
        .contains("platforms", plan.fromPlatforms)
        .select("id")
        .single();
      if (update.error) throw update.error;
    }
    results.push({
      title: plan.title,
      mediaType: plan.mediaType,
      field: "platforms",
      value: plan.toPlatforms,
      reason: plan.reason,
      status: APPLY ? "已补充" : "待补充",
    });
  }
  return results;
}

async function applySeasonRenamePlans(client, userId, entries) {
  const results = [];
  for (const plan of SEASON_RENAME_PLANS) {
    const entry = findExactEntry(entries, plan.title, plan.mediaType);
    const query = await client
      .from("media_seasons")
      .select("id,name")
      .eq("user_id", userId)
      .eq("media_entry_id", entry.id);
    if (query.error) throw query.error;
    const seasons = query.data || [];
    const fromMatches = seasons.filter((season) => season.name === plan.fromSeasonName);
    const toMatches = seasons.filter((season) => season.name === plan.toSeasonName);
    if (fromMatches.length === 0 && toMatches.length === 1) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        fromSeasonName: plan.fromSeasonName,
        toSeasonName: plan.toSeasonName,
        status: "已是正确值",
      });
      continue;
    }
    if (fromMatches.length !== 1 || toMatches.length !== 0) {
      throw new Error(
        `${plan.mediaType}《${plan.title}》分季“${plan.fromSeasonName}”匹配到 ${fromMatches.length} 条，`
          + `目标分季“${plan.toSeasonName}”匹配到 ${toMatches.length} 条。`,
      );
    }
    if (APPLY) {
      const update = await client
        .from("media_seasons")
        .update({ name: plan.toSeasonName })
        .eq("id", fromMatches[0].id)
        .eq("user_id", userId)
        .eq("name", plan.fromSeasonName)
        .select("id")
        .single();
      if (update.error) throw update.error;
    }
    results.push({
      title: plan.title,
      mediaType: plan.mediaType,
      fromSeasonName: plan.fromSeasonName,
      toSeasonName: plan.toSeasonName,
      reason: plan.reason,
      status: APPLY ? "已修正" : "待修正",
    });
  }
  return results;
}

async function applyEpisodePlans(client, userId, entries) {
  const results = [];
  for (const plan of EPISODE_PLANS) {
    const entry = findExactEntry(entries, plan.title, plan.mediaType);
    const seasonQuery = await client
      .from("media_seasons")
      .select("id,name,media_episodes(id,episode_number,title,plot_summary,is_favorite)")
      .eq("user_id", userId)
      .eq("media_entry_id", entry.id)
      .order("sort_order", { ascending: true });
    if (seasonQuery.error) throw seasonQuery.error;
    const seasons = seasonQuery.data || [];
    const matchingSeasons = seasons.filter(
      (season) => season.name.trim() === plan.seasonName
        || season.name.trim() === plan.previousSeasonName,
    );

    if (!matchingSeasons.length && seasons.length && !plan.allowAdditionalSeason) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        seasonName: plan.seasonName,
        episodeCount: plan.episodeCount,
        existingSeasons: seasons.map((season) => season.name),
        status: "已有其他分季，保留现有记录",
      });
      continue;
    }
    if (matchingSeasons.length > 1) {
      throw new Error(`${plan.mediaType}《${plan.title}》存在 ${matchingSeasons.length} 个同名分季。`);
    }

    if (!matchingSeasons.length) {
      if (APPLY) {
        const created = await client
          .rpc("create_media_season_with_episodes", {
            p_user_id: userId,
            p_media_entry_id: entry.id,
            p_name: plan.seasonName,
            p_episode_count: plan.episodeCount,
          })
          .single();
        if (created.error) throw created.error;
      }
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        seasonName: plan.seasonName,
        episodeCount: plan.episodeCount,
        source: plan.sourcePage,
        status: APPLY ? "已建立季集资料" : "待建立季集资料",
      });
      continue;
    }

    const season = matchingSeasons[0];
    const episodes = [...(season.media_episodes || [])]
      .sort((left, right) => left.episode_number - right.episode_number);
    const hasContinuousNumbers = episodes.every(
      (episode, index) => episode.episode_number === index + 1,
    );
    if (!hasContinuousNumbers) {
      throw new Error(`${plan.mediaType}《${plan.title}》的现有集号不连续，未自动修改。`);
    }
    if (episodes.length > plan.episodeCount) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        seasonName: plan.seasonName,
        episodeCount: episodes.length,
        expectedEpisodeCount: plan.episodeCount,
        status: "现有集数更多，保留现有记录",
      });
      continue;
    }
    if (episodes.length === plan.episodeCount) {
      results.push({
        title: plan.title,
        mediaType: plan.mediaType,
        seasonName: plan.seasonName,
        episodeCount: plan.episodeCount,
        status: "已是正确值",
      });
      continue;
    }

    if (APPLY) {
      for (let episodeCount = episodes.length; episodeCount < plan.episodeCount; episodeCount += 1) {
        const added = await client
          .rpc("add_next_media_episode", { p_user_id: userId, p_season_id: season.id })
          .single();
        if (added.error) throw added.error;
      }
    }
    results.push({
      title: plan.title,
      mediaType: plan.mediaType,
      seasonName: plan.seasonName,
      fromEpisodeCount: episodes.length,
      episodeCount: plan.episodeCount,
      source: plan.sourcePage,
      status: APPLY ? "已补齐集数" : "待补齐集数",
    });
  }
  return results;
}

async function main() {
  const { supabaseUrl, supabaseKey, allowedOpenIds } = requireRuntimeConfig();
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userId = await findWriterAccount(client, allowedOpenIds);
  const { data: entries, error } = await client
    .from("media_entries")
    .select("id,title,media_type,cover_url,platforms")
    .eq("user_id", userId);
  if (error) throw error;

  const correctionResults = await applyRecordCorrections(client, userId, entries || []);
  const correctedEntries = buildCorrectedEntries(entries || []);
  const attributeResults = await applyAttributePlans(client, userId, correctedEntries);
  const seasonRenameResults = await applySeasonRenamePlans(client, userId, correctedEntries);
  const episodeResults = await applyEpisodePlans(client, userId, correctedEntries);
  const results = [];
  const previews = [];
  for (const [index, plan] of COVER_PLANS.entries()) {
    const matches = correctedEntries.filter(
      (entry) => entry.title === plan.title && entry.media_type === plan.mediaType,
    );
    if (matches.length !== 1) {
      throw new Error(`${plan.mediaType}《${plan.title}》匹配到 ${matches.length} 条记录。`);
    }
    const entry = matches[0];
    if (entry.cover_url) {
      results.push({ title: plan.title, mediaType: plan.mediaType, status: "已有封面" });
      continue;
    }

    const downloaded = await downloadCover(plan);
    previews.push({ ...plan, image: downloaded.image });
    let status = "校验通过";
    if (APPLY) {
      const path = `entries/${entry.id}.webp`;
      const upload = await client.storage.from(MEDIA_COVER_BUCKET).upload(path, downloaded.image, {
        cacheControl: "31536000",
        contentType: "image/webp",
        upsert: true,
      });
      if (upload.error) throw upload.error;
      const publicUrl = client.storage.from(MEDIA_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
      const update = await client
        .from("media_entries")
        .update({ cover_url: publicUrl })
        .eq("id", entry.id)
        .eq("user_id", userId)
        .eq("cover_url", "")
        .select("id")
        .single();
      if (update.error) {
        await client.storage.from(MEDIA_COVER_BUCKET).remove([path]);
        throw update.error;
      }
      status = "已补充";
    }
    results.push({
      title: plan.title,
      mediaType: plan.mediaType,
      source: plan.sourcePage,
      sourceSize: `${downloaded.sourceWidth}x${downloaded.sourceHeight}`,
      outputBytes: downloaded.image.length,
      status,
    });
    console.log(`[${index + 1}/${COVER_PLANS.length}] ${plan.mediaType}《${plan.title}》：${status}`);
  }

  const previewSheet = await writePreview(previews);

  const { data: currentRows, error: currentError } = await client
    .from("media_entries")
    .select("id,cover_url")
    .eq("user_id", userId);
  if (currentError) throw currentError;
  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    corrections: correctionResults,
    attributes: attributeResults,
    seasonRenames: seasonRenameResults,
    episodes: episodeResults,
    planned: COVER_PLANS.length,
    updated: results.filter((result) => result.status === "已补充").length,
    validated: results.filter((result) => result.status === "校验通过").length,
    remainingMissing: (currentRows || []).filter((entry) => !entry.cover_url).length,
    previewSheet,
    results,
  }, null, 2));
}

await main();

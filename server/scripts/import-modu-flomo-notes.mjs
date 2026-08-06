import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_FILE = path.join(ROOT, '顾飞飞的笔记.html')
const APPLY = process.argv.includes('--apply')
const DEFAULT_TIMECODE = '00:00:00'
const IMPORT_ID_PREFIX = 'flomo_modu_legacy_'

const seasonNumbers = new Map([
  ['第一季', 1],
  ['第二季', 2],
  ['第三季', 3],
  ['第四季', 4],
  ['第五季', 5],
])

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim()
}

function chineseNumberToInteger(value) {
  const digits = new Map([
    ['零', 0], ['一', 1], ['二', 2], ['两', 2], ['三', 3], ['四', 4],
    ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9],
  ])
  if (value === '十') return 10
  if (value.includes('十')) {
    const [tens, ones] = value.split('十')
    return (tens ? digits.get(tens) : 1) * 10 + (ones ? digits.get(ones) : 0)
  }
  return digits.get(value)
}

function splitAtLimit(value, limit = 500) {
  const parts = []
  let remaining = value.trim()
  while (remaining.length > limit) {
    const candidates = ['\n', '。', '！', '？', '；', '，', ' ']
      .map((separator) => remaining.lastIndexOf(separator, limit))
    const splitAt = Math.max(...candidates)
    const end = splitAt >= Math.floor(limit * 0.6) ? splitAt + 1 : limit
    parts.push(remaining.slice(0, end).trim())
    remaining = remaining.slice(end).trim()
  }
  if (remaining) parts.push(remaining)
  return parts
}

function parseMemos(html) {
  const memos = []
  const blocks = html.matchAll(/<div class="memo">([\s\S]*?)<div class="files">/g)

  for (const block of blocks) {
    const content = block[1].match(/<div class="content">([\s\S]*?)<\/div>/)?.[1]
    if (!content) continue

    const paragraphs = [...content.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => decodeHtml(match[1]))
    const tag = paragraphs[0] || ''
    const seasonName = [...seasonNumbers.keys()].find((name) => tag.includes(`/默读/${name}`))
    if (!seasonName) continue

    const episodeMatch = (paragraphs[1] || '').match(/第([\u96f6\u4e00\u4e8c\u4e24\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341]+)期/)
    if (!episodeMatch) throw new Error(`无法识别集数：${paragraphs[1] || '（空）'}`)

    const episodeNumber = chineseNumberToInteger(episodeMatch[1])
    if (!episodeNumber) throw new Error(`无法转换中文集数：${episodeMatch[1]}`)

    const notes = paragraphs.slice(2).filter(Boolean).flatMap((paragraph) => splitAtLimit(paragraph))
    if (!notes.length) throw new Error(`${seasonName}第${episodeNumber}期没有笔记内容`)

    memos.push({ seasonName, seasonNumber: seasonNumbers.get(seasonName), episodeNumber, notes })
  }

  return memos
}

function sameJson(left, right) {
  const normalize = (notes) => notes.map((note) => ({
    id: note.id,
    timecode: note.timecode,
    content: note.content,
  }))
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right))
}

const html = await fs.readFile(SOURCE_FILE, 'utf8')
const memos = parseMemos(html)
const uniqueKeys = new Set(memos.map((memo) => `${memo.seasonNumber}-${memo.episodeNumber}`))
if (memos.length !== 72 || uniqueKeys.size !== 72) {
  throw new Error(`预期 72 条不重复笔记，实际解析 ${memos.length} 条、${uniqueKeys.size} 个唯一集数`)
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY
if (!supabaseUrl || !supabaseKey) throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY')
const supabase = createClient(supabaseUrl, supabaseKey)

const { data: entries, error: entriesError } = await supabase
  .from('media_entries')
  .select('id,title')
  .eq('title', '默读')
if (entriesError) throw entriesError

let targetEntry
let targetSeasons
for (const entry of entries || []) {
  const { data: seasons, error } = await supabase
    .from('media_seasons')
    .select('id,name,media_episodes(id,episode_number,title,timeline_notes)')
    .eq('media_entry_id', entry.id)
    .in('name', [...seasonNumbers.keys()].map((name) => `${name}（旧）`))
  if (error) throw error
  if (seasons?.length === 5) {
    targetEntry = entry
    targetSeasons = seasons
    break
  }
}
if (!targetEntry || !targetSeasons) throw new Error('数据库中未找到包含旧版五季的《默读》')

const seasonsByName = new Map(targetSeasons.map((season) => [season.name, season]))
const updates = []
for (const memo of memos) {
  const season = seasonsByName.get(`${memo.seasonName}（旧）`)
  const episode = season?.media_episodes?.find((item) => item.episode_number === memo.episodeNumber)
  if (!episode) throw new Error(`数据库中缺少 ${memo.seasonName}（旧）第 ${memo.episodeNumber} 期`)

  const existing = Array.isArray(episode.timeline_notes) ? episode.timeline_notes : []
  const preserved = existing.filter((note) => !String(note?.id || '').startsWith(IMPORT_ID_PREFIX))
  const imported = memo.notes.map((content, index) => ({
    id: `${IMPORT_ID_PREFIX}s${memo.seasonNumber}_e${memo.episodeNumber}_n${index + 1}`,
    timecode: DEFAULT_TIMECODE,
    type: 'normal',
    content,
    dialogues: [],
  }))
  const timelineNotes = [...preserved, ...imported]
  if (!sameJson(existing, timelineNotes)) updates.push({ memo, episode, timelineNotes, preserved: preserved.length })
}

const perSeason = Object.fromEntries([...seasonNumbers.entries()].map(([name, number]) => [
  `${name}（旧）`,
  {
    episodes: memos.filter((memo) => memo.seasonNumber === number).length,
    notes: memos.filter((memo) => memo.seasonNumber === number).reduce((sum, memo) => sum + memo.notes.length, 0),
  },
]))

console.log(JSON.stringify({
  mode: APPLY ? 'apply' : 'dry-run',
  mediaEntry: targetEntry,
  parsedMemos: memos.length,
  timelineItems: memos.reduce((sum, memo) => sum + memo.notes.length, 0),
  episodesToUpdate: updates.length,
  defaultTimecode: DEFAULT_TIMECODE,
  perSeason,
}, null, 2))

if (APPLY) {
  for (const update of updates) {
    const { error } = await supabase
      .from('media_episodes')
      .update({ timeline_notes: update.timelineNotes })
      .eq('id', update.episode.id)
    if (error) throw new Error(`更新 ${update.memo.seasonName}第${update.memo.episodeNumber}期失败：${error.message}`)
  }
  console.log(`已更新 ${updates.length} 集。`)
} else {
  console.log('当前为预演，传入 --apply 后才会写入数据库。')
}

import { ensureLogin, getCurrentUser } from "../../../services/auth"
import {
  addNextMediaEpisode,
  createMediaSeason,
  deleteMediaSeason,
  getMediaEntry,
  listMediaCategories,
  listMediaSeasons,
  replaceMediaEntryCover,
  setMediaEntryCoverFromSeason,
  updateMediaEntry,
  updateMediaEpisode,
  updateMediaSeason
} from "../../../services/media"
import type {
  MediaCategory,
  MediaEntry,
  MediaEpisode,
  MediaSeason,
  MediaStatus,
  MediaTimelineDialogue,
  MediaTimelineNote,
  MediaTimelineNoteType,
  MediaType
} from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import {
  getCachedMediaCategories,
  getCachedMediaEntry,
  getCachedMediaSeasons,
  isMediaCategoriesCacheFresh,
  isMediaEntryCacheFresh,
  isMediaSeasonsCacheFresh
} from "../../../utils/media-data-cache"
import {
  getMediaDataRevision,
  markMediaDataChanged
} from "../../../utils/media-data-revision"

let timelineNoteSequence = 0
let timelineDialogueSequence = 0
let episodeDraftTimer: ReturnType<typeof setTimeout> | null = null
const detailScrollPositions = new WeakMap<object, number>()
const recordsScrollPositions = new WeakMap<object, number>()

const EPISODIC_MEDIA_TYPES = ["电视剧", "动漫", "动画", "动画片", "广播剧"]
const BUILTIN_PLATFORMS = [
  "腾讯视频",
  "爱奇艺",
  "哔哩哔哩",
  "夸克",
  "优酷",
  "芒果 TV",
  "猫耳",
  "漫播",
  "Books"
]
const EPISODE_RENDER_BATCH = 20
const EPISODE_DRAFT_PREFIX = "media:episode-draft:v1:"
const RATING_OPTIONS = [1, 2, 3, 4, 5]

type TimePickerValue = [number, number, number]

type EditableTimelineNote = Omit<MediaTimelineNote, "type" | "dialogues"> & {
  type: MediaTimelineNoteType
  dialogues: MediaTimelineDialogue[]
  timePickerValue: TimePickerValue
}

const timePickerColumnSizes: TimePickerValue = [100, 60, 60]

// 微信原生 picker 没有 circular 属性。每列重复三段，并始终将选中项
// 归位到中间段，使首尾数字可以继续向两个方向滚动。
const timePickerRange = timePickerColumnSizes.map((size) =>
  Array.from({ length: size * 3 }, (_, index) => String(index % size).padStart(2, "0"))
)

const timelineNoteTypes: Array<{ value: MediaTimelineNoteType; label: string }> = [
  { value: "normal", label: "普通剧情" },
  { value: "key", label: "关键剧情" },
  { value: "quote", label: "语录" }
]

const timelineFilterOptions: Array<{
  value: MediaTimelineNoteType
  label: string
  selected: boolean
}> = [
  { value: "normal", label: "普通剧情", selected: true },
  { value: "key", label: "关键剧情", selected: true },
  { value: "quote", label: "语录", selected: true }
]

const allTimelineTypes = timelineFilterOptions.map((option) => option.value)

function isTimelineNoteType(value: unknown): value is MediaTimelineNoteType {
  return value === "normal" || value === "key" || value === "quote"
}

function createTimelineDialogue(speaker = "", content = ""): MediaTimelineDialogue {
  timelineDialogueSequence += 1
  return {
    id: `dialogue_${Date.now()}_${timelineDialogueSequence}`,
    speaker,
    content
  }
}

function getTimeValue(timecode: string): TimePickerValue {
  const match = /^(\d{2}):([0-5]\d):([0-5]\d)$/.exec(timecode.trim())
  if (!match) return [0, 0, 0]
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function getLoopedTimePickerValue(value: TimePickerValue): TimePickerValue {
  return value.map((part, index) => part + timePickerColumnSizes[index]) as TimePickerValue
}

function normalizeTimePickerValue(value: TimePickerValue): TimePickerValue {
  return value.map((part, index) => part % timePickerColumnSizes[index]) as TimePickerValue
}

function formatTimecode(value: TimePickerValue) {
  return value.map((part) => String(part).padStart(2, "0")).join(":")
}

function createEditableTimelineNote(note: MediaTimelineNote): EditableTimelineNote {
  const timeValue = getTimeValue(note.timecode)
  const type = isTimelineNoteType(note.type) ? note.type : "normal"
  const dialogues = Array.isArray(note.dialogues)
    ? note.dialogues.map((dialogue) => ({
        id: String(dialogue.id || createTimelineDialogue().id),
        speaker: String(dialogue.speaker || ""),
        content: String(dialogue.content || "")
      }))
    : []
  return {
    ...note,
    timecode: formatTimecode(timeValue),
    type,
    dialogues: type === "quote" && dialogues.length === 0
      ? [createTimelineDialogue("", note.content)]
      : dialogues,
    timePickerValue: getLoopedTimePickerValue(timeValue)
  }
}

function createTimelineNote(): EditableTimelineNote {
  timelineNoteSequence += 1
  return createEditableTimelineNote({
    id: `note_${Date.now()}_${timelineNoteSequence}`,
    timecode: "00:00:00",
    content: ""
  })
}

function getSubmittedText(
  values: WechatMiniprogram.IAnyObject,
  name: string,
  fallback: string
): string {
  const value = values[name]
  return typeof value === "string" ? value : fallback
}

function promptText(title: string, placeholder: string): Promise<string | null> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      success: (result) => resolve(result.confirm ? String(result.content || "").trim() : null),
      fail: () => resolve(null)
    })
  })
}

function favoriteCount(season: MediaSeason | null): number {
  return season?.episodes.filter((episode) => episode.is_favorite).length || 0
}

function supportedPlatforms(platforms: string[]) {
  return platforms.filter((name) => BUILTIN_PLATFORMS.includes(name))
}

function platformOptions(selectedPlatforms: string[]) {
  const supported = supportedPlatforms(selectedPlatforms)
  return BUILTIN_PLATFORMS.map((name) => ({
    name,
    checked: supported.includes(name)
  }))
}

function platformText(platforms: string[]) {
  const supported = supportedPlatforms(platforms)
  return supported.length ? supported.join("、") : "未填写"
}

function normalizedTimelineType(value: unknown): MediaTimelineNoteType {
  return value === "key" || value === "quote" ? value : "normal"
}

function normalizeTimelineNote(note: MediaTimelineNote): MediaTimelineNote {
  const type = normalizedTimelineType(note.type)
  return {
    ...note,
    type,
    dialogues: type === "quote" && Array.isArray(note.dialogues) ? note.dialogues : []
  }
}

function normalizeMediaSeasons(seasons: MediaSeason[]): MediaSeason[] {
  return seasons.map((season) => ({
    ...season,
    episodes: season.episodes.map((episode) => ({
      ...episode,
      timeline_notes: Array.isArray(episode.timeline_notes)
        ? episode.timeline_notes.map(normalizeTimelineNote)
        : []
    }))
  }))
}

function filterTimelineEpisodes(
  season: MediaSeason | null,
  selectedTypes: MediaTimelineNoteType[],
  favoriteOnly = false
): MediaEpisode[] {
  if (!season) return []
  const selected = new Set(selectedTypes)
  return season.episodes
    .filter((episode) => !favoriteOnly || episode.is_favorite)
    .map((episode) => ({
      ...episode,
      timeline_notes: episode.timeline_notes.filter((note) => selected.has(normalizedTimelineType(note.type)))
    }))
}

Page({
  data: {
    id: "",
    requestedSeasonId: "",
    entry: null as MediaEntry | null,
    seasons: [] as MediaSeason[],
    activeSeason: null as MediaSeason | null,
    filteredEpisodes: [] as MediaEpisode[],
    visibleEpisodeCount: EPISODE_RENDER_BATCH,
    activeSeasonIndex: 0,
    activeSeasonFavoriteCount: 0,
    timelineFilterOptions,
    timelineTypeFilters: [...allTimelineTypes] as MediaTimelineNoteType[],
    favoriteEpisodesOnly: false,
    coverUrl: "",
    platformText: "",
    mediaTypes: [] as MediaType[],
    canWrite: false,
    isEpisodic: false,
    isAudio: false,
    activeDetailTab: "detail" as "detail" | "records",
    editingEntry: false,
    entryDraftTitle: "",
    entryDraftMediaTypeIndex: 0,
    entryDraftWatchStatus: "completed" as MediaStatus,
    entryDraftPlatforms: [] as string[],
    entryPlatformOptions: platformOptions([]),
    entryDraftIsAudio: false,
    entryDraftIsEpisodic: false,
    selectedEntryImagePath: "",
    selectingEntryImage: false,
    showEntryImageCropper: false,
    entryCropSourcePath: "",
    savingEntry: false,
    editingEpisodeId: "",
    episodeDraftTitle: "",
    episodeDraftPlotSummary: "",
    episodeDraftTimelineNotes: [] as EditableTimelineNote[],
    timelineNoteTypes,
    timePickerRange,
    savingEpisode: false,
    episodeDraftDirty: false,
    loading: true,
    contentLoading: false,
    detailRefresherTriggered: false,
    hasLoaded: false,
    mediaRevision: -1,
    operating: false,
    detailScrollTop: 0,
    recordsScrollTop: 0,
    errorMessage: "",
    ratingOptions: RATING_OPTIONS
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    detailScrollPositions.set(this, 0)
    recordsScrollPositions.set(this, 0)
    this.setData({
      id: String(query.id || ""),
      requestedSeasonId: String(query.seasonId || "")
    })
  },

  onShow() {
    if (!this.data.id) return
    activateAsyncPage(this)
    if (!this.data.hasLoaded || this.data.mediaRevision !== getMediaDataRevision()) {
      void this.loadPage()
    } else if (
      !isMediaEntryCacheFresh(this.data.id)
      || !isMediaSeasonsCacheFresh(this.data.id)
      || !isMediaCategoriesCacheFresh()
    ) {
      void this.loadPage({ forceRefresh: true, background: true })
    }
  },

  onUnload() {
    this.flushEpisodeDraft()
    deactivateAsyncPage(this)
    detailScrollPositions.delete(this)
    recordsScrollPositions.delete(this)
  },

  onHide() {
    this.flushEpisodeDraft()
  },

  async loadPage(options: { forceRefresh?: boolean; background?: boolean } = {}) {
    const cachedEntry = options.forceRefresh ? null : getCachedMediaEntry(this.data.id)
    const cachedSeasons = options.forceRefresh ? null : getCachedMediaSeasons(this.data.id)
    const cachedCategories = options.forceRefresh ? null : getCachedMediaCategories()
    const currentUser = getCurrentUser()
    if (cachedEntry && cachedSeasons && cachedCategories && currentUser) {
      this.applyPageData(cachedEntry, cachedSeasons, cachedCategories, currentUser.can_write)
      this.setData({
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        errorMessage: ""
      })
      if (
        !isMediaEntryCacheFresh(this.data.id)
        || !isMediaSeasonsCacheFresh(this.data.id)
        || !isMediaCategoriesCacheFresh()
      ) {
        void this.loadPage({ forceRefresh: true, background: true })
      }
      return
    }

    const generation = beginAsyncPageRequest(this)
    const background = options.background === true
    const showInitialLoading = !this.data.hasLoaded && !background
    if (!background) {
      this.setData({
        loading: showInitialLoading,
        contentLoading: !showInitialLoading,
        errorMessage: ""
      })
    }
    try {
      const session = await ensureLogin()
      const [entry, seasons, categories] = await Promise.all([
        getMediaEntry(this.data.id, { forceRefresh: options.forceRefresh }),
        listMediaSeasons(this.data.id, { forceRefresh: options.forceRefresh }),
        listMediaCategories({ forceRefresh: options.forceRefresh })
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      this.applyPageData(entry, seasons, categories, session.user.can_write)
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "加载失败"
      if (background) return
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({
          loading: false,
          contentLoading: false,
          detailRefresherTriggered: false,
          hasLoaded: true
        })
      }
    }
  },

  applyPageData(
    entry: MediaEntry,
    seasons: MediaSeason[],
    categories: MediaCategory[],
    canWrite: boolean
  ) {
    const normalizedSeasons = normalizeMediaSeasons(seasons)
    const requestedIndex = normalizedSeasons.findIndex((season) => season.id === this.data.requestedSeasonId)
    const activeSeasonIndex = requestedIndex >= 0
      ? requestedIndex
      : Math.min(this.data.activeSeasonIndex, Math.max(0, normalizedSeasons.length - 1))
    const activeSeason = normalizedSeasons[activeSeasonIndex] || null
    const isEpisodic = normalizedSeasons.length > 0 || EPISODIC_MEDIA_TYPES.includes(entry.media_type)
    const activeDetailTab = isEpisodic ? this.data.activeDetailTab : "detail"
    this.setData({
      entry,
      seasons: normalizedSeasons,
      activeSeasonIndex,
      activeSeason,
      filteredEpisodes: filterTimelineEpisodes(activeSeason, this.data.timelineTypeFilters, this.data.favoriteEpisodesOnly),
      visibleEpisodeCount: Math.max(EPISODE_RENDER_BATCH, this.data.visibleEpisodeCount),
      activeSeasonFavoriteCount: favoriteCount(activeSeason),
      coverUrl: entry.cover_url || normalizedSeasons[0]?.cover_url || "",
      platformText: platformText(entry.platforms),
      mediaTypes: categories.map((category) => category.name),
      canWrite,
      isEpisodic,
      isAudio: entry.media_type === "广播剧",
      activeDetailTab,
      requestedSeasonId: "",
      mediaRevision: getMediaDataRevision()
    }, () => {
      if (activeDetailTab === "records") this.restoreRecordsScroll()
      else this.restoreDetailScroll()
    })
    wx.setNavigationBarTitle({ title: entry.title })
  },

  handleDetailScroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
    const scrollTop = Number(event.detail.scrollTop)
    if (Number.isFinite(scrollTop)) detailScrollPositions.set(this, scrollTop)
  },

  handleRecordsScroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
    const scrollTop = Number(event.detail.scrollTop)
    if (Number.isFinite(scrollTop)) recordsScrollPositions.set(this, scrollTop)
  },

  restoreDetailScroll() {
    const detailScrollTop = detailScrollPositions.get(this) || 0
    if (Math.abs(this.data.detailScrollTop - detailScrollTop) < 1) return
    this.setData({ detailScrollTop })
  },

  restoreRecordsScroll() {
    const recordsScrollTop = recordsScrollPositions.get(this) || 0
    if (Math.abs(this.data.recordsScrollTop - recordsScrollTop) < 1) return
    this.setData({ recordsScrollTop })
  },

  handleDetailPullRefresh() {
    if (this.data.operating || this.data.savingEntry || this.data.savingEpisode) return
    this.setData({ detailRefresherTriggered: true })
    void this.loadPage({ forceRefresh: true, background: true })
  },

  handleRecordsLower() {
    if (this.data.visibleEpisodeCount >= this.data.filteredEpisodes.length) return
    this.setData({
      visibleEpisodeCount: Math.min(
        this.data.filteredEpisodes.length,
        this.data.visibleEpisodeCount + EPISODE_RENDER_BATCH
      )
    })
  },

  handleSeasonTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.editingEpisodeId) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    const index = Number(event.currentTarget.dataset.index)
    const activeSeason = this.data.seasons[index]
    if (!activeSeason) return
    this.setData({
      activeSeasonIndex: index,
      activeSeason,
      filteredEpisodes: filterTimelineEpisodes(activeSeason, this.data.timelineTypeFilters, this.data.favoriteEpisodesOnly),
      visibleEpisodeCount: EPISODE_RENDER_BATCH,
      activeSeasonFavoriteCount: favoriteCount(activeSeason)
    })
  },

  handleDetailTabTap(event: WechatMiniprogram.TouchEvent) {
    const activeDetailTab = String(event.currentTarget.dataset.tab || "") as "detail" | "records"
    if (!(["detail", "records"] as string[]).includes(activeDetailTab)) return
    if (activeDetailTab === "records" && !this.data.isEpisodic) return
    if (activeDetailTab === this.data.activeDetailTab) return
    if (this.data.editingEntry) {
      wx.showToast({ title: "请先完成或取消作品编辑", icon: "none" })
      return
    }
    if (this.data.editingEpisodeId) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    this.setData({ activeDetailTab })
  },

  handleFavoriteEpisodesFilterTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.editingEpisodeId) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    const favoriteEpisodesOnly = String(event.currentTarget.dataset.scope || "") === "favorites"
    this.setData({
      favoriteEpisodesOnly,
      filteredEpisodes: filterTimelineEpisodes(
        this.data.activeSeason,
        this.data.timelineTypeFilters,
        favoriteEpisodesOnly
      ),
      visibleEpisodeCount: EPISODE_RENDER_BATCH
    })
  },

  handleTimelineFilterTypeTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.editingEpisodeId) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    const type = String(event.currentTarget.dataset.type || "") as MediaTimelineNoteType
    if (!allTimelineTypes.includes(type)) return
    const isSelected = this.data.timelineTypeFilters.includes(type)
    if (isSelected && this.data.timelineTypeFilters.length === 1) {
      wx.showToast({ title: "请至少保留一种时间线类型", icon: "none" })
      return
    }
    const timelineTypeFilters = isSelected
      ? this.data.timelineTypeFilters.filter((item) => item !== type)
      : allTimelineTypes.filter((item) => [...this.data.timelineTypeFilters, type].includes(item))
    this.setData({
      timelineTypeFilters,
      timelineFilterOptions: this.data.timelineFilterOptions.map((option) => ({
        ...option,
        selected: timelineTypeFilters.includes(option.value)
      })),
      filteredEpisodes: filterTimelineEpisodes(this.data.activeSeason, timelineTypeFilters, this.data.favoriteEpisodesOnly),
      visibleEpisodeCount: EPISODE_RENDER_BATCH
    })
  },

  handleTimelineFilterReset() {
    if (this.data.editingEpisodeId) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    const timelineTypeFilters = [...allTimelineTypes]
    this.setData({
      timelineTypeFilters,
      favoriteEpisodesOnly: false,
      timelineFilterOptions: this.data.timelineFilterOptions.map((option) => ({
        ...option,
        selected: true
      })),
      filteredEpisodes: filterTimelineEpisodes(this.data.activeSeason, timelineTypeFilters),
      visibleEpisodeCount: EPISODE_RENDER_BATCH
    })
  },

  async handleSetSeasonCover() {
    const entry = this.data.entry
    const season = this.data.activeSeason
    if (!this.data.canWrite || !entry || !season || this.data.operating) return
    if (!season.cover_url) {
      wx.showToast({ title: "这一季还没有图片", icon: "none" })
      return
    }
    if (entry.cover_url === season.cover_url) {
      wx.showToast({ title: "当前已是作品封面", icon: "none" })
      return
    }
    this.setData({ operating: true })
    wx.showLoading({ title: "设置中", mask: true })
    try {
      const updatedEntry = await setMediaEntryCoverFromSeason(entry.id, season.id)
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.setData({
        entry: updatedEntry,
        coverUrl: updatedEntry.cover_url,
        mediaRevision
      })
      wx.showToast({ title: "已设为封面", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "设置失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  handleEditEntry() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    const mediaTypes = this.data.mediaTypes.includes(entry.media_type)
      ? this.data.mediaTypes
      : [...this.data.mediaTypes, entry.media_type]
    this.setData({
      editingEntry: true,
      mediaTypes,
      entryDraftTitle: entry.title,
      entryDraftMediaTypeIndex: Math.max(0, mediaTypes.indexOf(entry.media_type)),
      entryDraftWatchStatus: entry.watch_status,
      entryDraftPlatforms: supportedPlatforms(entry.platforms),
      entryPlatformOptions: platformOptions(entry.platforms),
      entryDraftIsAudio: entry.media_type === "广播剧",
      entryDraftIsEpisodic: EPISODIC_MEDIA_TYPES.includes(entry.media_type),
      selectedEntryImagePath: ""
    }, () => wx.enableAlertBeforeUnload({ message: "作品修改还没有保存，确定离开吗？" }))
  },

  handleEntryEditCancel() {
    if (this.data.savingEntry || this.data.selectingEntryImage) return
    wx.disableAlertBeforeUnload()
    this.setData({
      editingEntry: false,
      entryDraftTitle: "",
      entryDraftPlatforms: [],
      entryPlatformOptions: platformOptions([]),
      selectedEntryImagePath: "",
      showEntryImageCropper: false,
      entryCropSourcePath: ""
    })
  },

  handleEntryTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ entryDraftTitle: event.detail.value })
  },

  handleEntryTypeChange(event: WechatMiniprogram.PickerChange) {
    const entryDraftMediaTypeIndex = Number(event.detail.value)
    const mediaType = this.data.mediaTypes[entryDraftMediaTypeIndex]
    if (!mediaType) return
    this.setData({
      entryDraftMediaTypeIndex,
      entryDraftIsAudio: mediaType === "广播剧",
      entryDraftIsEpisodic: EPISODIC_MEDIA_TYPES.includes(mediaType)
    })
  },

  handleEntryPlatformTap(event: WechatMiniprogram.TouchEvent) {
    const name = String(event.currentTarget.dataset.name || "")
    if (!name || this.data.savingEntry) return
    const selected = this.data.entryDraftPlatforms
    const entryDraftPlatforms = selected.includes(name)
      ? selected.filter((item) => item !== name)
      : [...selected, name]
    this.setData({
      entryDraftPlatforms,
      entryPlatformOptions: platformOptions(entryDraftPlatforms)
    })
  },

  handleEntryCoverTap() {
    if (
      !this.data.editingEntry
      || this.data.savingEntry
      || this.data.selectingEntryImage
      || this.data.showEntryImageCropper
    ) return
    this.setData({ selectingEntryImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        if (!isAsyncPageActive(this)) return
        const path = result.tempFiles[0]?.tempFilePath
        this.setData(path
          ? {
              selectingEntryImage: false,
              showEntryImageCropper: true,
              entryCropSourcePath: path
            }
          : { selectingEntryImage: false })
      },
      fail: () => {
        if (isAsyncPageActive(this)) this.setData({ selectingEntryImage: false })
      }
    })
  },

  handleEntryImageCropCancel() {
    this.setData({ showEntryImageCropper: false, entryCropSourcePath: "" })
  },

  handleEntryImageCropConfirm(
    event: WechatMiniprogram.CustomEvent<{ tempFilePath?: string }>
  ) {
    const selectedEntryImagePath = String(event.detail.tempFilePath || "")
    if (!selectedEntryImagePath) return
    this.setData({
      selectedEntryImagePath,
      showEntryImageCropper: false,
      entryCropSourcePath: ""
    })
  },

  handleEntryImageCropError(
    event: WechatMiniprogram.CustomEvent<{ message?: string }>
  ) {
    wx.showToast({
      title: event.detail.message || "图片裁剪失败，请重试",
      icon: "none",
      duration: 3000
    })
  },

  async handleCompleteEntryEdit() {
    const entry = this.data.entry
    if (
      !this.data.canWrite
      || !entry
      || !this.data.editingEntry
      || this.data.savingEntry
      || this.data.selectingEntryImage
      || this.data.showEntryImageCropper
    ) return
    const title = this.data.entryDraftTitle.trim()
    const mediaType = this.data.mediaTypes[this.data.entryDraftMediaTypeIndex]
    const platforms = [...new Set(this.data.entryDraftPlatforms)]
      .filter((name) => BUILTIN_PLATFORMS.includes(name))
    if (!title || !mediaType) {
      wx.showToast({ title: "请填写名称和分类", icon: "none" })
      return
    }
    this.setData({ savingEntry: true })
    wx.showLoading({ title: "保存中", mask: true })
    let persistedEntry: MediaEntry | null = null
    try {
      persistedEntry = await updateMediaEntry(entry.id, {
        title,
        media_type: mediaType,
        watch_status: this.data.entryDraftWatchStatus,
        platforms
      })
      if (this.data.selectedEntryImagePath) {
        persistedEntry = await replaceMediaEntryCover(
          entry.id,
          this.data.selectedEntryImagePath
        )
      }
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      const isEpisodic = this.data.seasons.length > 0
        || EPISODIC_MEDIA_TYPES.includes(persistedEntry.media_type)
      this.setData({
        entry: persistedEntry,
        coverUrl: persistedEntry.cover_url || this.data.seasons[0]?.cover_url || "",
        platformText: platformText(persistedEntry.platforms),
        isAudio: persistedEntry.media_type === "广播剧",
        isEpisodic,
        activeDetailTab: isEpisodic ? this.data.activeDetailTab : "detail",
        editingEntry: false,
        entryDraftTitle: "",
        entryDraftPlatforms: [],
        entryPlatformOptions: platformOptions([]),
        selectedEntryImagePath: "",
        savingEntry: false,
        mediaRevision
      }, () => this.restoreDetailScroll())
      wx.disableAlertBeforeUnload()
      wx.setNavigationBarTitle({ title: persistedEntry.title })
      wx.showToast({ title: "编辑完成", icon: "success" })
    } catch (error) {
      if (!isAsyncPageActive(this)) return
      if (persistedEntry) {
        const mediaRevision = markMediaDataChanged()
        this.setData({
          entry: persistedEntry,
          coverUrl: persistedEntry.cover_url || this.data.seasons[0]?.cover_url || "",
          platformText: platformText(persistedEntry.platforms),
          isAudio: persistedEntry.media_type === "广播剧",
          isEpisodic: this.data.seasons.length > 0
            || EPISODIC_MEDIA_TYPES.includes(persistedEntry.media_type),
          mediaRevision
        })
      }
      const message = error instanceof Error ? error.message : "保存失败，请稍后重试"
      wx.showToast({
        title: persistedEntry && this.data.selectedEntryImagePath
          ? `资料已保存，封面上传失败：${message}`
          : message,
        icon: "none",
        duration: 3000
      })
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ savingEntry: false })
    }
  },

  handlePersonalRatingTap(event: WechatMiniprogram.TouchEvent) {
    const personalRating = Number(event.currentTarget.dataset.rating)
    if (!Number.isInteger(personalRating) || personalRating < 1 || personalRating > 5) return
    void this.setPersonalRating(personalRating)
  },

  handlePersonalRatingClear() {
    void this.setPersonalRating(null)
  },

  async setPersonalRating(personalRating: number | null) {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    if (this.data.editingEntry) {
      wx.showToast({ title: "请先完成或取消作品编辑", icon: "none" })
      return
    }
    if (entry.watch_status !== "completed") return
    if (entry.personal_rating === personalRating) return
    this.setData({
      entry: {
        ...entry,
        personal_rating: personalRating,
        is_revisitable: personalRating !== null && personalRating >= 4
      },
      operating: true
    })
    try {
      const persistedEntry = await updateMediaEntry(entry.id, { personal_rating: personalRating })
      const mediaRevision = markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        this.setData({ entry: persistedEntry, mediaRevision })
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ entry, operating: false })
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
      }
      return
    }
    if (isAsyncPageActive(this)) this.setData({ operating: false })
  },

  async handleWatchStatusTap(event: WechatMiniprogram.TouchEvent) {
    const entry = this.data.entry
    const watchStatus = String(event.currentTarget.dataset.status || "") as MediaStatus
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    if (!(["planned", "in_progress", "completed"] as string[]).includes(watchStatus)) return
    if (this.data.editingEntry) {
      this.setData({ entryDraftWatchStatus: watchStatus })
      return
    }
    if (entry.watch_status === watchStatus) return
    this.setData({
      entry: { ...entry, watch_status: watchStatus },
      operating: true
    })
    try {
      await updateMediaEntry(entry.id, { watch_status: watchStatus })
      const mediaRevision = markMediaDataChanged()
      if (isAsyncPageActive(this)) this.setData({ mediaRevision })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ entry })
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  async handleAddSeason() {
    if (!this.data.canWrite || this.data.operating) return
    const name = await promptText("新增季或篇章", `例如：第${this.data.seasons.length + 1}季`)
    if (!name || !isAsyncPageActive(this)) return
    const countText = await promptText("总集数", "请输入 0 到 500；更新中可填 0")
    if (countText === null || !isAsyncPageActive(this)) return
    const episodeCount = Number(countText || "0")
    if (!Number.isInteger(episodeCount) || episodeCount < 0 || episodeCount > 500) {
      wx.showToast({ title: "总集数需为 0 到 500 的整数", icon: "none" })
      return
    }
    this.setData({ operating: true })
    wx.showLoading({ title: "创建中", mask: true })
    try {
      const season = await createMediaSeason(this.data.id, name, episodeCount)
      markMediaDataChanged()
      this.setData({ requestedSeasonId: season.id })
      await this.loadPage()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  handleSeasonManage() {
    const season = this.data.activeSeason
    if (!this.data.canWrite || !season || this.data.operating) return
    wx.showActionSheet({
      itemList: ["修改名称", "增加下一集", "删除本季"],
      success: (result) => {
        if (result.tapIndex === 0) this.renameSeason(season)
        else if (result.tapIndex === 1) this.addEpisode(season)
        else if (result.tapIndex === 2) this.removeSeason(season)
      }
    })
  },

  async renameSeason(season: MediaSeason) {
    const name = await promptText("修改名称", `当前：${season.name}`)
    if (!name || !isAsyncPageActive(this)) return
    try {
      await updateMediaSeason(season.id, name)
      markMediaDataChanged()
      this.setData({ requestedSeasonId: season.id })
      await this.loadPage()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
      }
    }
  },

  async addEpisode(season: MediaSeason) {
    this.setData({ operating: true })
    try {
      await addNextMediaEpisode(season.id)
      markMediaDataChanged()
      this.setData({ requestedSeasonId: season.id })
      await this.loadPage()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "新增失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  removeSeason(season: MediaSeason) {
    wx.showModal({
      title: `删除${season.name}`,
      content: `其中的 ${season.episodes.length} 集及剧情记录都会删除，且无法恢复。`,
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ operating: true })
        try {
          await deleteMediaSeason(season.id)
          markMediaDataChanged()
          this.setData({ activeSeasonIndex: 0 })
          await this.loadPage()
        } catch (error) {
          if (isAsyncPageActive(this)) {
            wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
          }
        } finally {
          if (isAsyncPageActive(this)) this.setData({ operating: false })
        }
      }
    })
  },

  episodeDraftKey(id: string) {
    return `${EPISODE_DRAFT_PREFIX}${id}`
  },

  readEpisodeDraft(id: string): {
    title: string
    plotSummary: string
    timelineNotes: MediaTimelineNote[]
  } | null {
    try {
      const draft = wx.getStorageSync(this.episodeDraftKey(id)) as {
        title?: unknown
        plotSummary?: unknown
        timelineNotes?: unknown
      } | undefined
      if (!draft || typeof draft.title !== "string" || typeof draft.plotSummary !== "string") return null
      return {
        title: draft.title,
        plotSummary: draft.plotSummary,
        timelineNotes: Array.isArray(draft.timelineNotes)
          ? draft.timelineNotes as MediaTimelineNote[]
          : []
      }
    } catch (_error) {
      return null
    }
  },

  persistEpisodeDraft() {
    const id = this.data.editingEpisodeId
    if (!id) return
    const timelineNotes = this.data.episodeDraftTimelineNotes.map((note) => ({
      id: note.id,
      timecode: note.timecode,
      type: note.type,
      content: note.content,
      dialogues: note.dialogues.map((dialogue) => ({ ...dialogue }))
    }))
    try {
      wx.setStorageSync(this.episodeDraftKey(id), {
        title: this.data.episodeDraftTitle,
        plotSummary: this.data.episodeDraftPlotSummary,
        timelineNotes
      })
    } catch (_error) {
      // 本地空间不足时不阻断当前编辑。
    }
    if (!this.data.episodeDraftDirty) this.setData({ episodeDraftDirty: true })
    wx.enableAlertBeforeUnload({ message: "剧情修改还没有保存，确定离开吗？" })
  },

  scheduleEpisodeDraftPersist() {
    if (episodeDraftTimer) clearTimeout(episodeDraftTimer)
    episodeDraftTimer = setTimeout(() => {
      episodeDraftTimer = null
      this.persistEpisodeDraft()
    }, 240)
  },

  flushEpisodeDraft() {
    if (!episodeDraftTimer) return
    clearTimeout(episodeDraftTimer)
    episodeDraftTimer = null
    this.persistEpisodeDraft()
  },

  clearEpisodeDraft(id: string) {
    if (episodeDraftTimer) clearTimeout(episodeDraftTimer)
    episodeDraftTimer = null
    try {
      wx.removeStorageSync(this.episodeDraftKey(id))
    } catch (_error) {
      // 忽略草稿清理失败。
    }
    wx.disableAlertBeforeUnload()
  },

  handleEpisodeEdit(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.savingEpisode) return
    const id = String(event.currentTarget.dataset.id || "")
    const episode = this.data.activeSeason?.episodes.find((item) => item.id === id)
    if (!episode) return
    if (this.data.editingEpisodeId && this.data.editingEpisodeId !== id) {
      wx.showToast({ title: "请先保存或取消当前编辑", icon: "none" })
      return
    }
    const draft = this.readEpisodeDraft(id)
    this.setData({
      editingEpisodeId: id,
      episodeDraftTitle: draft?.title ?? episode.title,
      episodeDraftPlotSummary: draft?.plotSummary ?? episode.plot_summary,
      episodeDraftTimelineNotes: (draft?.timelineNotes || episode.timeline_notes || [])
        .map(createEditableTimelineNote),
      episodeDraftDirty: Boolean(draft)
    }, () => {
      wx.enableAlertBeforeUnload({ message: "剧情修改还没有保存，确定离开吗？" })
      if (draft) wx.showToast({ title: "已恢复未保存剧情", icon: "none" })
    })
  },

  handleEpisodeEditCancel() {
    if (this.data.savingEpisode) return
    const id = this.data.editingEpisodeId
    if (id) this.clearEpisodeDraft(id)
    this.setData({
      editingEpisodeId: "",
      episodeDraftTitle: "",
      episodeDraftPlotSummary: "",
      episodeDraftTimelineNotes: [],
      episodeDraftDirty: false
    })
  },

  handleEpisodeTitleInput(event: WechatMiniprogram.Input) {
    this.setData({ episodeDraftTitle: event.detail.value }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeSummaryInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ episodeDraftPlotSummary: event.detail.value }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeAddTimelineNote() {
    if (this.data.episodeDraftTimelineNotes.length >= 100) {
      wx.showToast({ title: "每集最多记录 100 个时间点", icon: "none" })
      return
    }
    this.setData({
      episodeDraftTimelineNotes: [
        ...this.data.episodeDraftTimelineNotes,
        createTimelineNote()
      ]
    }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeTimelineTimeChange(event: WechatMiniprogram.PickerChange) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.episodeDraftTimelineNotes[index]) return
    const pickerValue = event.detail.value as number[]
    if (pickerValue.length !== 3 || pickerValue.some((value) => !Number.isInteger(value))) return
    const rawPickerValue: TimePickerValue = [pickerValue[0], pickerValue[1], pickerValue[2]]
    const timeValue = normalizeTimePickerValue(rawPickerValue)
    const episodeDraftTimelineNotes = [...this.data.episodeDraftTimelineNotes]
    episodeDraftTimelineNotes[index] = {
      ...episodeDraftTimelineNotes[index],
      timecode: formatTimecode(timeValue),
      timePickerValue: getLoopedTimePickerValue(timeValue)
    }
    this.setData({ episodeDraftTimelineNotes }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeTimelineTimeColumnChange(event: WechatMiniprogram.PickerColumnChange) {
    const index = Number(event.currentTarget.dataset.index)
    const column = event.detail.column
    const value = event.detail.value
    const note = this.data.episodeDraftTimelineNotes[index]
    const columnSize = timePickerColumnSizes[column]
    if (!note || columnSize === undefined || !Number.isInteger(value)) return
    if (value >= columnSize && value < columnSize * 2) {
      note.timePickerValue[column] = value
      return
    }
    const timePickerValue = [...note.timePickerValue] as TimePickerValue
    timePickerValue[column] = columnSize + (value % columnSize)
    const episodeDraftTimelineNotes = [...this.data.episodeDraftTimelineNotes]
    episodeDraftTimelineNotes[index] = { ...note, timePickerValue }
    this.setData({ episodeDraftTimelineNotes }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeTimelineTypeChange(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const type = String(event.currentTarget.dataset.type || "")
    if (
      !Number.isInteger(index)
      || !this.data.episodeDraftTimelineNotes[index]
      || !isTimelineNoteType(type)
    ) return
    const episodeDraftTimelineNotes = [...this.data.episodeDraftTimelineNotes]
    const note = episodeDraftTimelineNotes[index]
    if (note.type === type) return
    let content = note.content
    let dialogues = note.dialogues
    if (type === "quote" && dialogues.length === 0) {
      dialogues = [createTimelineDialogue("", content)]
    } else if (note.type === "quote" && type !== "quote" && !content.trim()) {
      content = dialogues
        .map((dialogue) => `${dialogue.speaker.trim()}：${dialogue.content.trim()}`)
        .join("\n")
    }
    episodeDraftTimelineNotes[index] = { ...note, type, content, dialogues }
    this.setData({ episodeDraftTimelineNotes }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeTimelineContentInput(event: WechatMiniprogram.TextareaInput) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.episodeDraftTimelineNotes[index]) return
    this.data.episodeDraftTimelineNotes[index].content = event.detail.value
    this.scheduleEpisodeDraftPersist()
  },

  handleEpisodeTimelineContentBlur(event: WechatMiniprogram.TextareaBlur) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.episodeDraftTimelineNotes[index]) return
    this.data.episodeDraftTimelineNotes[index].content = event.detail.value
    this.scheduleEpisodeDraftPersist()
  },

  handleEpisodeDialogueSpeakerInput(event: WechatMiniprogram.Input) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const dialogue = this.data.episodeDraftTimelineNotes[noteIndex]?.dialogues[dialogueIndex]
    if (!dialogue) return
    dialogue.speaker = event.detail.value
    this.scheduleEpisodeDraftPersist()
  },

  handleEpisodeDialogueContentInput(event: WechatMiniprogram.TextareaInput) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const dialogue = this.data.episodeDraftTimelineNotes[noteIndex]?.dialogues[dialogueIndex]
    if (!dialogue) return
    dialogue.content = event.detail.value
    this.scheduleEpisodeDraftPersist()
  },

  handleEpisodeAddDialogue(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const note = this.data.episodeDraftTimelineNotes[index]
    if (!note || note.type !== "quote") return
    if (note.dialogues.length >= 20) {
      wx.showToast({ title: "每个时间点最多记录 20 条对话", icon: "none" })
      return
    }
    const episodeDraftTimelineNotes = [...this.data.episodeDraftTimelineNotes]
    episodeDraftTimelineNotes[index] = {
      ...note,
      dialogues: [...note.dialogues, createTimelineDialogue()]
    }
    this.setData({ episodeDraftTimelineNotes }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeRemoveDialogue(event: WechatMiniprogram.TouchEvent) {
    const noteIndex = Number(event.currentTarget.dataset.noteIndex)
    const dialogueIndex = Number(event.currentTarget.dataset.dialogueIndex)
    const note = this.data.episodeDraftTimelineNotes[noteIndex]
    if (!note || note.type !== "quote" || note.dialogues.length <= 1 || !note.dialogues[dialogueIndex]) return
    const episodeDraftTimelineNotes = [...this.data.episodeDraftTimelineNotes]
    episodeDraftTimelineNotes[noteIndex] = {
      ...note,
      dialogues: note.dialogues.filter((_, index) => index !== dialogueIndex)
    }
    this.setData({ episodeDraftTimelineNotes }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeRemoveTimelineNote(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.episodeDraftTimelineNotes[index]) return
    this.setData({
      episodeDraftTimelineNotes: this.data.episodeDraftTimelineNotes.filter(
        (_, noteIndex) => noteIndex !== index
      )
    }, () => this.scheduleEpisodeDraftPersist())
  },

  handleEpisodeSave(event: WechatMiniprogram.FormSubmit) {
    const id = String(event.currentTarget.dataset.id || "")
    void this.saveEpisodeDraft(id, event.detail.value)
  },

  handleEpisodeStickySave() {
    void this.saveEpisodeDraft(this.data.editingEpisodeId, {})
  },

  async saveEpisodeDraft(id: string, submittedValues: WechatMiniprogram.IAnyObject) {
    if (
      !this.data.canWrite
      || this.data.savingEpisode
      || !id
      || id !== this.data.editingEpisodeId
    ) return
    const title = getSubmittedText(submittedValues, "title", this.data.episodeDraftTitle)
    const plotSummary = getSubmittedText(
      submittedValues,
      "plot_summary",
      this.data.episodeDraftPlotSummary
    )
    const timelineNotes = this.data.episodeDraftTimelineNotes.map((note, noteIndex) => ({
      ...note,
      content: note.type === "quote"
        ? note.content
        : getSubmittedText(
            submittedValues,
            `timeline_content_${noteIndex}`,
            note.content
          ),
      dialogues: note.type === "quote"
        ? note.dialogues.map((dialogue, dialogueIndex) => ({
            ...dialogue,
            speaker: getSubmittedText(
              submittedValues,
              `dialogue_speaker_${noteIndex}_${dialogueIndex}`,
              dialogue.speaker
            ),
            content: getSubmittedText(
              submittedValues,
              `dialogue_content_${noteIndex}_${dialogueIndex}`,
              dialogue.content
            )
          }))
        : note.dialogues
    }))
    this.data.episodeDraftTitle = title
    this.data.episodeDraftPlotSummary = plotSummary
    this.data.episodeDraftTimelineNotes = timelineNotes
    if (timelineNotes.some((note) => !/^\d{2}:[0-5]\d:[0-5]\d$/.test(note.timecode.trim()))) {
      wx.showToast({ title: "时间需使用 01:03:09 格式", icon: "none" })
      return
    }
    if (timelineNotes.some((note) => note.type !== "quote" && !note.content.trim())) {
      wx.showToast({ title: "请填写每条剧情内容", icon: "none" })
      return
    }
    if (timelineNotes.some((note) =>
      note.type === "quote"
      && (note.dialogues.length === 0 || note.dialogues.some((dialogue) =>
        !dialogue.speaker.trim() || !dialogue.content.trim()
      ))
    )) {
      wx.showToast({ title: "请填写语录中的人物和文案", icon: "none" })
      return
    }
    this.setData({ savingEpisode: true })
    try {
      const updatedEpisode = await updateMediaEpisode(id, {
        title,
        plot_summary: plotSummary,
        timeline_notes: timelineNotes.map((note) => ({
          id: note.id,
          timecode: note.timecode.trim(),
          type: note.type,
          content: note.type === "quote" ? "" : note.content.trim(),
          dialogues: note.type === "quote"
            ? note.dialogues.map((dialogue) => ({
                id: dialogue.id,
                speaker: dialogue.speaker.trim(),
                content: dialogue.content.trim()
              }))
            : []
        }))
      })
      const normalizedEpisode = {
        ...updatedEpisode,
        timeline_notes: Array.isArray(updatedEpisode.timeline_notes)
          ? updatedEpisode.timeline_notes.map(normalizeTimelineNote)
          : []
      }
      const seasons = [...this.data.seasons]
      const currentSeason = seasons[this.data.activeSeasonIndex]
      const activeSeason = currentSeason
        ? {
            ...currentSeason,
            episodes: currentSeason.episodes.map((episode) =>
              episode.id === id ? normalizedEpisode : episode
            )
          }
        : null
      if (activeSeason) seasons[this.data.activeSeasonIndex] = activeSeason
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.clearEpisodeDraft(id)
      this.setData({
        seasons,
        activeSeason,
        filteredEpisodes: filterTimelineEpisodes(
          activeSeason,
          this.data.timelineTypeFilters,
          this.data.favoriteEpisodesOnly
        ),
        activeSeasonFavoriteCount: favoriteCount(activeSeason),
        editingEpisodeId: "",
        episodeDraftTitle: "",
        episodeDraftPlotSummary: "",
        episodeDraftTimelineNotes: [],
        episodeDraftDirty: false,
        savingEpisode: false,
        mediaRevision
      }, () => this.restoreRecordsScroll())
      wx.showToast({ title: "保存成功", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ savingEpisode: false })
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败，请稍后重试",
          icon: "none",
          duration: 3000
        })
      }
    }
  },

  async handleFavoriteTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.operating || !this.data.activeSeason) return
    const id = String(event.currentTarget.dataset.id || "")
    const episode = this.data.activeSeason.episodes.find((item) => item.id === id)
    if (!episode) return
    const isFavorite = !episode.is_favorite
    const seasons = [...this.data.seasons]
    const activeSeason = {
      ...this.data.activeSeason,
      episodes: this.data.activeSeason.episodes.map((item) =>
        item.id === id ? { ...item, is_favorite: isFavorite } : item
      )
    }
    seasons[this.data.activeSeasonIndex] = activeSeason
    this.setData({
      seasons,
      activeSeason,
      filteredEpisodes: filterTimelineEpisodes(
        activeSeason,
        this.data.timelineTypeFilters,
        this.data.favoriteEpisodesOnly
      ),
      activeSeasonFavoriteCount: favoriteCount(activeSeason),
      entry: this.data.entry
        ? {
            ...this.data.entry,
            favorite_episode_count: Math.max(
              0,
              this.data.entry.favorite_episode_count + (isFavorite ? 1 : -1)
            )
          }
        : null,
      operating: true
    })
    try {
      await updateMediaEpisode(id, { is_favorite: isFavorite })
      const mediaRevision = markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        this.setData({ mediaRevision })
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
        await this.loadPage()
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  }
})

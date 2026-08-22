import { ensureLogin, getCurrentUser } from "../../../services/auth"
import { UI_COLORS } from "../../../styles/colors"
import {
  getMediaEntry,
  listMediaCategories,
  listMediaSeasons,
  replaceMediaEntryCover,
  setMediaWatchProgress,
  updateMediaEntry,
  updateMediaEpisode
} from "../../../services/media"
import type {
  MediaCategory,
  MediaEntry,
  MediaEpisode,
  MediaSeason,
  MediaStatus,
  MediaType
} from "../../../types/media"
import type { ImageCrop, ImageCropResult } from "../../../types/images"
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

const detailScrollPositions = new WeakMap<object, number>()

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
const EPISODE_RANGE_SIZE = 10
const EPISODE_SUMMARY_MAX_LENGTH = 24
const RATING_OPTIONS = [1, 2, 3, 4, 5]

function favoriteCount(season: MediaSeason | null): number {
  return season?.episodes.filter((episode) => episode.is_favorite).length || 0
}

function episodeRangeOptions(season: MediaSeason | null) {
  const episodeCount = season?.episodes.length || 0
  return Array.from({ length: Math.ceil(episodeCount / EPISODE_RANGE_SIZE) }, (_, index) => {
    const start = index * EPISODE_RANGE_SIZE + 1
    const end = Math.min((index + 1) * EPISODE_RANGE_SIZE, episodeCount)
    return { label: `${start}-${end}`, start, end }
  })
}

function episodePickerEpisodes(
  season: MediaSeason | null,
  rangeIndex: number,
  favoriteOnly = false
): MediaEpisode[] {
  if (!season) return []
  if (favoriteOnly) return season.episodes.filter((episode) => episode.is_favorite)
  const startIndex = Math.max(0, rangeIndex) * EPISODE_RANGE_SIZE
  return season.episodes.slice(startIndex, startIndex + EPISODE_RANGE_SIZE)
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

function watchProgressText(entry: MediaEntry | null) {
  if (!entry?.last_watched_episode_id || !Number.isInteger(entry.last_watched_episode_number)) {
    return "记录看到哪一集"
  }
  const seasonNumber = Number.isInteger(entry.last_watched_season_number)
    ? Number(entry.last_watched_season_number)
    : Number.isInteger(Number(entry.last_watched_season_sort_order) / 1000)
      ? Number(entry.last_watched_season_sort_order) / 1000
      : null
  if (entry.season_count > 1 && seasonNumber) {
    return `看到第 ${seasonNumber} 季 · ${entry.last_watched_episode_number} 集`
  }
  return `看到 ${entry.last_watched_episode_number} 集`
}

Page({
  data: {
    id: "",
    requestedSeasonId: "",
    entry: null as MediaEntry | null,
    seasons: [] as MediaSeason[],
    activeSeason: null as MediaSeason | null,
    activeSeasonIndex: 0,
    activeSeasonFavoriteCount: 0,
    activeEpisodeRangeIndex: 0,
    episodeRangeOptions: [] as Array<{ label: string; start: number; end: number }>,
    episodePickerEpisodes: [] as MediaEpisode[],
    episodePickerFavoriteOnly: false,
    coverUrl: "",
    platformText: "",
    mediaTypes: [] as MediaType[],
    canWrite: false,
    isEpisodic: false,
    isAudio: false,
    watchProgressText: "记录看到哪一集",
    progressPickerVisible: false,
    entryDraftMediaTypeIndex: 0,
    entryDraftPlatforms: [] as string[],
    entryPlatformOptions: platformOptions([]),
    entryChoiceDialogVisible: false,
    entryChoiceDialogPurpose: "" as "" | "category" | "platforms",
    selectedEntryImagePath: "",
    selectingEntryImage: false,
    showEntryImageCropper: false,
    entryCropSourcePath: "",
    savingEntry: false,
    loading: true,
    contentLoading: false,
    detailRefresherTriggered: false,
    hasLoaded: false,
    mediaRevision: -1,
    operating: false,
    textSheetVisible: false,
    textSheetPurpose: "",
    textSheetTitle: "",
    textSheetPlaceholder: "",
    textSheetValue: "",
    textSheetInputType: "text",
    textSheetConfirmText: "确定",
    textSheetMaxlength: 120,
    themeColors: UI_COLORS,
    pendingEpisodeId: "",
    detailScrollTop: 0,
    errorMessage: "",
    ratingOptions: RATING_OPTIONS
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    detailScrollPositions.set(this, 0)
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
    deactivateAsyncPage(this)
    detailScrollPositions.delete(this)
  },

  async loadPage(options: { forceRefresh?: boolean; background?: boolean } = {}) {
    const cachedEntry = options.forceRefresh ? null : getCachedMediaEntry(this.data.id)
    const cachedSeasons = options.forceRefresh ? null : getCachedMediaSeasons(this.data.id)
    const cachedCategories = options.forceRefresh ? null : getCachedMediaCategories()
    const currentUser = getCurrentUser()
    const canRenderFromListCache = Boolean(cachedEntry && cachedCategories && currentUser)
    if (cachedEntry && cachedCategories && currentUser) {
      this.applyPageData(cachedEntry, cachedSeasons || [], cachedCategories, currentUser.can_write)
      this.setData({
        loading: false,
        contentLoading: false,
        hasLoaded: true,
        errorMessage: ""
      })
      const hasFreshPageCache = cachedSeasons !== null
        && isMediaEntryCacheFresh(this.data.id)
        && isMediaSeasonsCacheFresh(this.data.id)
        && isMediaCategoriesCacheFresh()
      if (hasFreshPageCache) return
    }

    const generation = beginAsyncPageRequest(this)
    const background = options.background === true || canRenderFromListCache
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
    const requestedIndex = seasons.findIndex((season) => season.id === this.data.requestedSeasonId)
    const activeSeasonIndex = requestedIndex >= 0
      ? requestedIndex
      : Math.min(this.data.activeSeasonIndex, Math.max(0, seasons.length - 1))
    const activeSeason = seasons[activeSeasonIndex] || null
    const activeSeasonFavoriteCount = favoriteCount(activeSeason)
    const episodePickerFavoriteOnly = this.data.episodePickerFavoriteOnly
      && activeSeasonFavoriteCount > 0
    const activeEpisodeRangeIndex = Math.min(
      this.data.activeEpisodeRangeIndex,
      Math.max(0, episodeRangeOptions(activeSeason).length - 1)
    )
    const isEpisodic = seasons.length > 0 || EPISODIC_MEDIA_TYPES.includes(entry.media_type)
    this.setData({
      entry,
      seasons,
      activeSeasonIndex,
      activeSeason,
      activeSeasonFavoriteCount,
      activeEpisodeRangeIndex,
      episodeRangeOptions: episodeRangeOptions(activeSeason),
      episodePickerEpisodes: episodePickerEpisodes(
        activeSeason,
        activeEpisodeRangeIndex,
        episodePickerFavoriteOnly
      ),
      episodePickerFavoriteOnly,
      coverUrl: entry.cover_url || seasons[0]?.cover_url || "",
      platformText: platformText(entry.platforms),
      mediaTypes: categories.map((category) => category.name),
      canWrite,
      isEpisodic,
      isAudio: entry.media_type === "广播剧",
      watchProgressText: watchProgressText(entry),
      requestedSeasonId: "",
      mediaRevision: getMediaDataRevision()
    }, () => this.restoreDetailScroll())
    wx.setNavigationBarTitle({ title: entry.title })
  },

  handleDetailScroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
    const scrollTop = Number(event.detail.scrollTop)
    if (Number.isFinite(scrollTop)) detailScrollPositions.set(this, scrollTop)
  },

  restoreDetailScroll() {
    const detailScrollTop = detailScrollPositions.get(this) || 0
    if (Math.abs(this.data.detailScrollTop - detailScrollTop) < 1) return
    this.setData({ detailScrollTop })
  },

  handleDetailPullRefresh() {
    if (this.data.operating || this.data.savingEntry) return
    this.setData({ detailRefresherTriggered: true })
    void this.loadPage({ forceRefresh: true, background: true })
  },

  handleSeasonTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const activeSeason = this.data.seasons[index]
    if (!activeSeason) return
    const activeSeasonFavoriteCount = favoriteCount(activeSeason)
    const episodePickerFavoriteOnly = this.data.episodePickerFavoriteOnly
      && activeSeasonFavoriteCount > 0
    this.setData({
      activeSeasonIndex: index,
      activeSeason,
      activeSeasonFavoriteCount,
      activeEpisodeRangeIndex: 0,
      episodeRangeOptions: episodeRangeOptions(activeSeason),
      episodePickerEpisodes: episodePickerEpisodes(activeSeason, 0, episodePickerFavoriteOnly),
      episodePickerFavoriteOnly
    })
  },

  handleEpisodeRangeTap(event: WechatMiniprogram.TouchEvent) {
    const activeEpisodeRangeIndex = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(activeEpisodeRangeIndex) || activeEpisodeRangeIndex < 0) return
    if (!this.data.episodeRangeOptions[activeEpisodeRangeIndex]) return
    this.setData({
      activeEpisodeRangeIndex,
      episodePickerEpisodes: episodePickerEpisodes(
        this.data.activeSeason,
        activeEpisodeRangeIndex,
        this.data.episodePickerFavoriteOnly
      )
    })
  },

  handleEpisodePickerFavoriteTap() {
    const episodePickerFavoriteOnly = !this.data.episodePickerFavoriteOnly
    this.setData({
      episodePickerFavoriteOnly,
      episodePickerEpisodes: episodePickerEpisodes(
        this.data.activeSeason,
        this.data.activeEpisodeRangeIndex,
        episodePickerFavoriteOnly
      )
    })
  },

  handleWatchProgressTap() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || !this.data.isEpisodic || entry.watch_status !== "in_progress") return
    if (this.data.operating || this.data.savingEntry) return
    this.setData({ progressPickerVisible: true })
  },

  handleProgressPickerCancel() {
    if (this.data.operating) return
    this.setData({ progressPickerVisible: false })
  },

  async handleProgressPickerSelect(
    event: WechatMiniprogram.CustomEvent<{ episodeId: string }>
  ) {
    const entry = this.data.entry
    const episodeId = String(event.detail.episodeId || "")
    if (!this.data.canWrite || !entry || !episodeId || this.data.operating) return
    this.setData({ progressPickerVisible: false, operating: true })
    wx.showLoading({ title: "更新进度", mask: true })
    try {
      const persistedEntry = await setMediaWatchProgress(entry.id, episodeId)
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.setData({
        entry: persistedEntry,
        watchProgressText: watchProgressText(persistedEntry),
        mediaRevision
      })
      wx.showToast({ title: "观看进度已更新", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "进度更新失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  handleEntryTitleTap() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    this.setData({
      textSheetVisible: true,
      textSheetPurpose: "entry-title",
      textSheetTitle: "修改名称",
      textSheetPlaceholder: "输入作品名称",
      textSheetValue: entry.title,
      textSheetInputType: "text",
      textSheetConfirmText: "保存",
      textSheetMaxlength: 120,
      pendingEpisodeId: ""
    })
  },

  handleEntryCategoryTap() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    const mediaTypes = this.data.mediaTypes.includes(entry.media_type)
      ? this.data.mediaTypes
      : [...this.data.mediaTypes, entry.media_type]
    this.setData({
      mediaTypes,
      entryDraftMediaTypeIndex: Math.max(0, mediaTypes.indexOf(entry.media_type)),
      entryChoiceDialogVisible: true,
      entryChoiceDialogPurpose: "category"
    })
  },

  handleEntryPlatformsTap() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    const entryDraftPlatforms = supportedPlatforms(entry.platforms)
    this.setData({
      entryDraftPlatforms,
      entryPlatformOptions: platformOptions(entryDraftPlatforms),
      entryChoiceDialogVisible: true,
      entryChoiceDialogPurpose: "platforms"
    })
  },

  handleEntryTypeOptionTap(event: WechatMiniprogram.TouchEvent) {
    const entryDraftMediaTypeIndex = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(entryDraftMediaTypeIndex) || !this.data.mediaTypes[entryDraftMediaTypeIndex]) return
    this.setData({ entryDraftMediaTypeIndex })
  },

  handleEntryChoiceDialogCancel() {
    if (this.data.savingEntry) return
    this.setData({
      entryChoiceDialogVisible: false,
      entryChoiceDialogPurpose: "",
      entryDraftPlatforms: [],
      entryPlatformOptions: platformOptions([])
    })
  },

  handleEntryChoiceDialogConfirm() {
    const purpose = this.data.entryChoiceDialogPurpose
    if (purpose === "category") {
      const mediaType = this.data.mediaTypes[this.data.entryDraftMediaTypeIndex]
      if (!mediaType) return
      this.setData({ entryChoiceDialogVisible: false, entryChoiceDialogPurpose: "" })
      void this.saveEntryProperties({ media_type: mediaType })
      return
    }
    if (purpose === "platforms") {
      const platforms = [...new Set(this.data.entryDraftPlatforms)]
        .filter((name) => BUILTIN_PLATFORMS.includes(name))
      this.setData({
        entryChoiceDialogVisible: false,
        entryChoiceDialogPurpose: "",
        entryDraftPlatforms: [],
        entryPlatformOptions: platformOptions([])
      })
      void this.saveEntryProperties({ platforms })
    }
  },

  async saveEntryProperties(input: {
    title?: string
    media_type?: MediaType
    platforms?: string[]
  }) {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    this.setData({ savingEntry: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      const persistedEntry = await updateMediaEntry(entry.id, input)
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      const isEpisodic = this.data.seasons.length > 0
        || EPISODIC_MEDIA_TYPES.includes(persistedEntry.media_type)
      this.setData({
        entry: persistedEntry,
        platformText: platformText(persistedEntry.platforms),
        isAudio: persistedEntry.media_type === "广播剧",
        isEpisodic,
        mediaRevision
      })
      wx.setNavigationBarTitle({ title: persistedEntry.title })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ savingEntry: false })
    }
  },

  handleSpecialFavoriteChange() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    const isSpecialFavorite = !entry.is_special_favorite
    this.setData({
      entry: {
        ...entry,
        is_special_favorite: isSpecialFavorite
      },
      operating: true
    })
    wx.showLoading({ title: "更新中", mask: true })
    void (async () => {
      try {
        const persistedEntry = await updateMediaEntry(entry.id, {
          is_special_favorite: isSpecialFavorite
        })
        const mediaRevision = markMediaDataChanged()
        if (isAsyncPageActive(this)) {
          this.setData({
            entry: persistedEntry,
            mediaRevision
          })
        }
      } catch (error) {
        if (isAsyncPageActive(this)) {
          this.setData({
            entry,
            operating: false
          })
          wx.showToast({
            title: error instanceof Error ? error.message : "更新失败",
            icon: "none"
          })
        }
      } finally {
        wx.hideLoading()
        if (isAsyncPageActive(this)) this.setData({ operating: false })
      }
    })()
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
      !this.data.canWrite
      || this.data.savingEntry
      || this.data.selectingEntryImage
      || this.data.showEntryImageCropper
    ) return
    this.setData({ selectingEntryImage: true })
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sizeType: ["original"],
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
    event: WechatMiniprogram.CustomEvent<ImageCropResult>
  ) {
    const { tempFilePath, sourceFilePath, crop } = event.detail
    if (!tempFilePath || !sourceFilePath) return
    this.setData({
      selectedEntryImagePath: tempFilePath,
      showEntryImageCropper: false,
      entryCropSourcePath: ""
    })
    void this.saveEntryCover(sourceFilePath, crop || null)
  },

  async saveEntryCover(imagePath: string, crop: ImageCrop | null) {
    const entry = this.data.entry
    if (!entry || !imagePath || this.data.savingEntry) return
    this.setData({ savingEntry: true })
    wx.showLoading({ title: "保存中", mask: true })
    try {
      const persistedEntry = await replaceMediaEntryCover(entry.id, imagePath, crop)
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.setData({
        entry: persistedEntry,
        coverUrl: persistedEntry.cover_url,
        selectedEntryImagePath: "",
        mediaRevision
      })
      wx.showToast({ title: "封面已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ selectedEntryImagePath: "" })
        wx.showToast({ title: error instanceof Error ? error.message : "封面保存失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ savingEntry: false })
    }
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

  handlePersonalRatingTap(event: WechatMiniprogram.TouchEvent) {
    const personalRating = Number(event.currentTarget.dataset.rating)
    if (!Number.isInteger(personalRating) || personalRating < 1 || personalRating > 5) return
    void this.setPersonalRating(personalRating)
  },

  async setPersonalRating(personalRating: number) {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    if (entry.watch_status !== "completed") return
    if (entry.personal_rating === personalRating) return
    this.setData({
      entry: {
        ...entry,
        personal_rating: personalRating
      },
      operating: true
    })
    wx.showLoading({ title: "更新中", mask: true })
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
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  async handleWatchStatusTap(event: WechatMiniprogram.TouchEvent) {
    const entry = this.data.entry
    const watchStatus = String(event.currentTarget.dataset.status || "") as MediaStatus
    if (!this.data.canWrite || !entry || this.data.operating || this.data.savingEntry) return
    if (!(["planned", "in_progress", "completed"] as string[]).includes(watchStatus)) return
    if (entry.watch_status === watchStatus) return
    const personalRating = watchStatus === "completed"
      ? Number(entry.personal_rating) || 3
      : entry.personal_rating
    this.setData({
      entry: { ...entry, watch_status: watchStatus, personal_rating: personalRating },
      operating: true
    })
    wx.showLoading({ title: "更新中", mask: true })
    try {
      const persistedEntry = await updateMediaEntry(entry.id, { watch_status: watchStatus })
      const mediaRevision = markMediaDataChanged()
      if (isAsyncPageActive(this)) {
        this.setData({
          entry: persistedEntry,
          watchProgressText: watchProgressText(persistedEntry),
          mediaRevision
        })
      }
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ entry })
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
      }
    } finally {
      wx.hideLoading()
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  handleTextSheetInput(event: WechatMiniprogram.Input) {
    this.setData({ textSheetValue: event.detail.value })
  },

  handleTextSheetCancel() {
    if (this.data.operating) return
    this.setData({
      textSheetVisible: false,
      textSheetPurpose: "",
      textSheetValue: "",
      textSheetMaxlength: 120,
      pendingEpisodeId: ""
    })
  },

  handleTextSheetConfirm() {
    const value = this.data.textSheetValue.trim()
    if (this.data.textSheetPurpose === "entry-title") {
      if (!value) {
        wx.showToast({ title: "请填写名称", icon: "none" })
        return
      }
      this.handleTextSheetCancel()
      void this.saveEntryProperties({ title: value })
      return
    }
    if (this.data.textSheetPurpose === "episode-summary") {
      if (value.length > EPISODE_SUMMARY_MAX_LENGTH) {
        wx.showToast({ title: `剧情详情不能超过 ${EPISODE_SUMMARY_MAX_LENGTH} 个字`, icon: "none" })
        return
      }
      const episodeId = this.data.pendingEpisodeId
      this.handleTextSheetCancel()
      void this.saveEpisodeSummary(episodeId, value)
    }
  },

  handleEpisodeSummaryTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.operating) return
    const episodeId = String(event.currentTarget.dataset.id || "")
    const episode = this.data.activeSeason?.episodes.find((item) => item.id === episodeId)
    if (!episode) return
    this.setData({
      textSheetVisible: true,
      textSheetPurpose: "episode-summary",
      textSheetTitle: episode.title
        ? `第 ${episode.episode_number} 集 · ${episode.title}`
        : `第 ${episode.episode_number} 集剧情详情`,
      textSheetPlaceholder: "用一句话记录本集剧情",
      textSheetValue: episode.plot_summary,
      textSheetInputType: "text",
      textSheetConfirmText: "保存",
      textSheetMaxlength: EPISODE_SUMMARY_MAX_LENGTH,
      pendingEpisodeId: episode.id
    })
  },

  async saveEpisodeSummary(episodeId: string, plotSummary: string) {
    const activeSeason = this.data.activeSeason
    if (!episodeId || !activeSeason || !isAsyncPageActive(this)) return
    this.setData({ operating: true })
    try {
      const updatedEpisode = await updateMediaEpisode(episodeId, { plot_summary: plotSummary })
      const seasons = [...this.data.seasons]
      const nextActiveSeason = {
        ...activeSeason,
        episodes: activeSeason.episodes.map((episode) =>
          episode.id === episodeId ? { ...episode, ...updatedEpisode } : episode
        )
      }
      seasons[this.data.activeSeasonIndex] = nextActiveSeason
      const mediaRevision = markMediaDataChanged()
      if (!isAsyncPageActive(this)) return
      this.setData({
        seasons,
        activeSeason: nextActiveSeason,
        episodePickerEpisodes: episodePickerEpisodes(
          nextActiveSeason,
          this.data.activeEpisodeRangeIndex,
          this.data.episodePickerFavoriteOnly
        ),
        mediaRevision
      })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ operating: false })
    }
  },

  handleSeasonManage() {
    if (!this.data.canWrite || !this.data.id || this.data.operating) return
    wx.navigateTo({
      url: `/pages/media/season-manage/index?id=${encodeURIComponent(this.data.id)}`
    })
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
    const activeSeasonFavoriteCount = favoriteCount(activeSeason)
    const episodePickerFavoriteOnly = this.data.episodePickerFavoriteOnly
      && activeSeasonFavoriteCount > 0
    this.setData({
      seasons,
      activeSeason,
      activeSeasonFavoriteCount,
      episodePickerEpisodes: episodePickerEpisodes(
        activeSeason,
        this.data.activeEpisodeRangeIndex,
        episodePickerFavoriteOnly
      ),
      episodePickerFavoriteOnly,
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

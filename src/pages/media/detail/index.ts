import { ensureLogin } from "../../../services/auth"
import {
  addNextMediaEpisode,
  createMediaSeason,
  deleteMediaEntry,
  deleteMediaSeason,
  getMediaEntry,
  listMediaSeasons,
  setMediaEntryCoverFromSeason,
  updateMediaEntry,
  updateMediaEpisode,
  updateMediaSeason
} from "../../../services/media"
import type {
  MediaEntry,
  MediaEpisode,
  MediaSeason,
  MediaTimelineNote,
  MediaTimelineNoteType
} from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

let savedPageScrollTop = 0

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
    activeSeasonIndex: 0,
    activeSeasonFavoriteCount: 0,
    timelineFilterOpen: false,
    timelineFilterOptions,
    timelineTypeFilters: [...allTimelineTypes] as MediaTimelineNoteType[],
    favoriteEpisodesOnly: false,
    coverUrl: "",
    canWrite: false,
    isAudio: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    operating: false,
    errorMessage: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    savedPageScrollTop = 0
    activateAsyncPage(this)
    this.setData({
      id: String(query.id || ""),
      requestedSeasonId: String(query.seasonId || "")
    })
  },

  onShow() {
    if (!this.data.id) return
    activateAsyncPage(this)
    this.loadPage()
  },

  onUnload() {
    deactivateAsyncPage(this)
    savedPageScrollTop = 0
  },

  onPageScroll(event: { scrollTop: number }) {
    savedPageScrollTop = event.scrollTop
  },

  async loadPage() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    const scrollTopBeforeRefresh = savedPageScrollTop
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })
    try {
      const session = await ensureLogin()
      const [entry, seasons] = await Promise.all([
        getMediaEntry(this.data.id),
        listMediaSeasons(this.data.id)
      ])
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const normalizedSeasons = normalizeMediaSeasons(seasons)
      const requestedIndex = normalizedSeasons.findIndex((season) => season.id === this.data.requestedSeasonId)
      const activeSeasonIndex = requestedIndex >= 0
        ? requestedIndex
        : Math.min(this.data.activeSeasonIndex, Math.max(0, normalizedSeasons.length - 1))
      const activeSeason = normalizedSeasons[activeSeasonIndex] || null
      this.setData({
        entry,
        seasons: normalizedSeasons,
        activeSeasonIndex,
        activeSeason,
        filteredEpisodes: filterTimelineEpisodes(activeSeason, this.data.timelineTypeFilters, this.data.favoriteEpisodesOnly),
        activeSeasonFavoriteCount: favoriteCount(activeSeason),
        coverUrl: entry.cover_url || normalizedSeasons[0]?.cover_url || "",
        canWrite: session.user.can_write,
        isAudio: entry.media_type === "广播剧",
        requestedSeasonId: ""
      })
      wx.setNavigationBarTitle({ title: entry.title })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const message = error instanceof Error ? error.message : "加载失败"
      if (showInitialLoading) this.setData({ errorMessage: message })
      else wx.showToast({ title: message, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true }, () => {
          if (!showInitialLoading && scrollTopBeforeRefresh > 0) {
            wx.pageScrollTo({ scrollTop: scrollTopBeforeRefresh, duration: 0 })
          }
        })
      }
    }
  },

  handleSeasonTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const activeSeason = this.data.seasons[index]
    if (!activeSeason) return
    this.setData({
      activeSeasonIndex: index,
      activeSeason,
      filteredEpisodes: filterTimelineEpisodes(activeSeason, this.data.timelineTypeFilters, this.data.favoriteEpisodesOnly),
      activeSeasonFavoriteCount: favoriteCount(activeSeason)
    })
  },

  handleTimelineFilterToggle() {
    this.setData({ timelineFilterOpen: !this.data.timelineFilterOpen })
  },

  handleFavoriteEpisodesFilterTap(event: WechatMiniprogram.TouchEvent) {
    const favoriteEpisodesOnly = String(event.currentTarget.dataset.scope || "") === "favorites"
    this.setData({
      favoriteEpisodesOnly,
      filteredEpisodes: filterTimelineEpisodes(
        this.data.activeSeason,
        this.data.timelineTypeFilters,
        favoriteEpisodesOnly
      )
    })
  },

  handleTimelineFilterTypeTap(event: WechatMiniprogram.TouchEvent) {
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
      filteredEpisodes: filterTimelineEpisodes(this.data.activeSeason, timelineTypeFilters, this.data.favoriteEpisodesOnly)
    })
  },

  handleTimelineFilterReset() {
    const timelineTypeFilters = [...allTimelineTypes]
    this.setData({
      timelineTypeFilters,
      favoriteEpisodesOnly: false,
      timelineFilterOptions: this.data.timelineFilterOptions.map((option) => ({
        ...option,
        selected: true
      })),
      filteredEpisodes: filterTimelineEpisodes(this.data.activeSeason, timelineTypeFilters)
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
      if (!isAsyncPageActive(this)) return
      this.setData({ entry: updatedEntry, coverUrl: updatedEntry.cover_url })
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
    if (!this.data.canWrite || !this.data.entry || this.data.operating) return
    wx.setStorageSync("MEDIA_EDIT_ITEM", this.data.entry)
    wx.navigateTo({ url: `/pages/media/edit/index?id=${this.data.entry.id}` })
  },

  handleDeleteEntry() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating) return
    wx.showModal({
      title: `删除《${entry.title}》？`,
      content: `删除后，这部作品的 ${entry.season_count || 0} 个季和 ${entry.episode_count || 0} 集记录也会一起删除，且无法恢复。`,
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ operating: true })
        wx.showLoading({ title: "删除中", mask: true })
        try {
          await deleteMediaEntry(entry.id)
          wx.removeStorageSync("MEDIA_EDIT_ITEM")
          wx.removeStorageSync("MEDIA_EPISODE_EDIT")
          if (!isAsyncPageActive(this)) return
          wx.showToast({ title: "已删除", icon: "success" })
          wx.navigateBack()
        } catch (error) {
          if (isAsyncPageActive(this)) {
            wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
          }
        } finally {
          wx.hideLoading()
          if (isAsyncPageActive(this)) this.setData({ operating: false })
        }
      }
    })
  },

  async handleToggleRevisitable() {
    const entry = this.data.entry
    if (!this.data.canWrite || !entry || this.data.operating) return
    const nextValue = !entry.is_revisitable
    this.setData({ entry: { ...entry, is_revisitable: nextValue }, operating: true })
    try {
      await updateMediaEntry(entry.id, { is_revisitable: nextValue })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        this.setData({ entry, operating: false })
        wx.showToast({ title: error instanceof Error ? error.message : "更新失败", icon: "none" })
      }
      return
    }
    if (isAsyncPageActive(this)) this.setData({ operating: false })
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

  handleEpisodeEdit(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite) return
    const id = String(event.currentTarget.dataset.id || "")
    const episode = this.data.activeSeason?.episodes.find((item) => item.id === id)
    if (!episode || !this.data.entry || !this.data.activeSeason) return
    wx.setStorageSync("MEDIA_EPISODE_EDIT", {
      episode,
      mediaTitle: this.data.entry.title,
      seasonName: this.data.activeSeason.name
    })
    wx.navigateTo({ url: `/pages/media/episode-edit/index?id=${id}` })
  },

  async handleFavoriteTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.operating || !this.data.activeSeason) return
    const id = String(event.currentTarget.dataset.id || "")
    const episode = this.data.activeSeason.episodes.find((item) => item.id === id)
    if (!episode) return
    const isFavorite = !episode.is_favorite
    const seasons = this.data.seasons.map((season) => ({
      ...season,
      episodes: season.episodes.map((item) =>
        item.id === id ? { ...item, is_favorite: isFavorite } : item
      )
    }))
    this.setData({
      seasons,
      activeSeason: seasons[this.data.activeSeasonIndex],
      filteredEpisodes: filterTimelineEpisodes(
        seasons[this.data.activeSeasonIndex],
        this.data.timelineTypeFilters,
        this.data.favoriteEpisodesOnly
      ),
      activeSeasonFavoriteCount: favoriteCount(seasons[this.data.activeSeasonIndex]),
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

import { ensureLogin } from "../../../services/auth"
import { listMediaSeasons, saveMediaSeasonDrafts } from "../../../services/media"
import type { MediaSeason } from "../../../types/media"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"
import { markMediaDataChanged } from "../../../utils/media-data-revision"

type DraftEpisode = {
  key: string
  id: string
  plot_summary: string
  is_favorite: boolean
}

type DraftSeason = {
  key: string
  id: string
  name: string
  episodes: DraftEpisode[]
}

let draftSequence = 0

function draftKey(prefix: string) {
  draftSequence += 1
  return `${prefix}_${Date.now()}_${draftSequence}`
}

function createEpisodeDraft(id = "", plotSummary = "", isFavorite = false): DraftEpisode {
  return { key: id || draftKey("episode"), id, plot_summary: plotSummary, is_favorite: isFavorite }
}

function createSeasonDraft(season: MediaSeason): DraftSeason {
  return {
    key: season.id,
    id: season.id,
    name: season.name,
    episodes: season.episodes.map((episode) =>
      createEpisodeDraft(episode.id, episode.plot_summary, episode.is_favorite)
    )
  }
}

function deletionCounts(originalSeasons: MediaSeason[], drafts: DraftSeason[]) {
  const seasonIds = new Set(drafts.map((season) => season.id).filter(Boolean))
  const episodeIds = new Set(drafts.flatMap((season) => season.episodes.map((episode) => episode.id)).filter(Boolean))
  return {
    seasons: originalSeasons.filter((season) => !seasonIds.has(season.id)).length,
    episodes: originalSeasons.flatMap((season) => season.episodes).filter((episode) => !episodeIds.has(episode.id)).length
  }
}

Page({
  data: {
    id: "",
    originalSeasons: [] as MediaSeason[],
    draftSeasons: [] as DraftSeason[],
    expandedSeasonKey: "",
    loading: true,
    saving: false,
    dirty: false,
    deleteDialogVisible: false,
    pendingDeleteSeasonIndex: -1,
    confirmDialogVisible: false,
    confirmDialogPurpose: "" as "" | "save" | "leave",
    confirmDialogContent: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    this.setData({ id: String(query.id || "") })
    void this.loadPage()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadPage() {
    if (!this.data.id) {
      wx.showToast({ title: "缺少作品编号", icon: "none" })
      return
    }
    const generation = beginAsyncPageRequest(this)
    this.setData({ loading: true })
    try {
      const [session, seasons] = await Promise.all([
        ensureLogin(),
        listMediaSeasons(this.data.id, { forceRefresh: true })
      ])
      if (!session.user.can_write) throw new Error("当前账号没有编辑权限")
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const draftSeasons = seasons.map(createSeasonDraft)
      this.setData({
        originalSeasons: seasons,
        draftSeasons,
        expandedSeasonKey: draftSeasons[0]?.key || "",
        dirty: false
      })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleSeasonToggle(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "")
    this.setData({ expandedSeasonKey: this.data.expandedSeasonKey === key ? "" : key })
  },

  handleSeasonNameInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const season = this.data.draftSeasons[index]
    if (!season) return
    this.setData({ [`draftSeasons[${index}].name`]: event.detail.value, dirty: true })
  },

  resizeSeason(index: number, requestedCount: number) {
    const season = this.data.draftSeasons[index]
    const count = Math.max(0, Math.min(500, Math.trunc(requestedCount)))
    if (!season || !Number.isFinite(count) || count === season.episodes.length) return
    const episodes = season.episodes.slice(0, count)
    while (episodes.length < count) episodes.push(createEpisodeDraft())
    this.setData({ [`draftSeasons[${index}].episodes`]: episodes, dirty: true })
  },

  handleEpisodeCountStep(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const delta = Number(event.currentTarget.dataset.delta)
    const season = this.data.draftSeasons[index]
    if (!season) return
    this.resizeSeason(index, season.episodes.length + delta)
  },

  handleEpisodeCountInput(event: WechatMiniprogram.Input) {
    const index = Number(event.currentTarget.dataset.index)
    const count = Number(event.detail.value)
    if (!Number.isInteger(count) || count < 0 || count > 500) {
      wx.showToast({ title: "总集数需为 0 到 500 的整数", icon: "none" })
      return
    }
    this.resizeSeason(index, count)
  },

  handleEpisodeSummaryInput(event: WechatMiniprogram.Input) {
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    if (!this.data.draftSeasons[seasonIndex]?.episodes[episodeIndex]) return
    this.setData({
      [`draftSeasons[${seasonIndex}].episodes[${episodeIndex}].plot_summary`]: event.detail.value,
      dirty: true
    })
  },

  handleEpisodeFavoriteTap(event: WechatMiniprogram.TouchEvent) {
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    const episode = this.data.draftSeasons[seasonIndex]?.episodes[episodeIndex]
    if (!episode) return
    this.setData({
      [`draftSeasons[${seasonIndex}].episodes[${episodeIndex}].is_favorite`]: !episode.is_favorite,
      dirty: true
    })
  },

  handleSeasonAdd() {
    if (this.data.draftSeasons.length >= 50) {
      wx.showToast({ title: "每部作品最多 50 季", icon: "none" })
      return
    }
    const key = draftKey("season")
    const draftSeasons = [...this.data.draftSeasons, {
      key,
      id: "",
      name: `第${this.data.draftSeasons.length + 1}季`,
      episodes: []
    }]
    this.setData({ draftSeasons, expandedSeasonKey: key, dirty: true })
  },

  handleSeasonDeleteRequest(event: WechatMiniprogram.TouchEvent) {
    this.setData({
      deleteDialogVisible: true,
      pendingDeleteSeasonIndex: Number(event.currentTarget.dataset.index)
    })
  },

  handleSeasonDeleteCancel() {
    this.setData({ deleteDialogVisible: false, pendingDeleteSeasonIndex: -1 })
  },

  handleSeasonDeleteConfirm() {
    const index = this.data.pendingDeleteSeasonIndex
    const removed = this.data.draftSeasons[index]
    if (!removed) return this.handleSeasonDeleteCancel()
    const draftSeasons = this.data.draftSeasons.filter((_, seasonIndex) => seasonIndex !== index)
    this.setData({
      draftSeasons,
      expandedSeasonKey: draftSeasons[Math.min(index, draftSeasons.length - 1)]?.key || "",
      dirty: true,
      deleteDialogVisible: false,
      pendingDeleteSeasonIndex: -1
    })
  },

  validateDrafts() {
    const names = new Set<string>()
    for (const season of this.data.draftSeasons) {
      const name = season.name.trim()
      if (!name) return "请填写季名称"
      if (names.has(name.toLocaleLowerCase())) return "季名称不能重复"
      names.add(name.toLocaleLowerCase())
      if (season.episodes.some((episode) => episode.plot_summary.trim().length > 20)) {
        return "剧情详情不能超过 20 个字"
      }
    }
    return ""
  },

  handleSaveRequest() {
    if (!this.data.dirty || this.data.saving) return
    const validationError = this.validateDrafts()
    if (validationError) {
      wx.showToast({ title: validationError, icon: "none" })
      return
    }
    const deleted = deletionCounts(this.data.originalSeasons, this.data.draftSeasons)
    if (deleted.seasons || deleted.episodes) {
      this.setData({
        confirmDialogVisible: true,
        confirmDialogPurpose: "save",
        confirmDialogContent: `保存后将删除 ${deleted.seasons} 季、${deleted.episodes} 集，且无法恢复。`
      })
      return
    }
    void this.saveDrafts()
  },

  async saveDrafts() {
    this.setData({ saving: true, confirmDialogVisible: false, confirmDialogPurpose: "" })
    try {
      const seasons = await saveMediaSeasonDrafts(
        this.data.id,
        this.data.draftSeasons.map((season) => ({
          id: season.id,
          name: season.name.trim(),
          episodes: season.episodes.map((episode) => ({
            id: episode.id,
            plot_summary: episode.plot_summary.trim(),
            is_favorite: episode.is_favorite
          }))
        }))
      )
      if (!isAsyncPageActive(this)) return
      const draftSeasons = seasons.map(createSeasonDraft)
      markMediaDataChanged()
      this.setData({
        originalSeasons: seasons,
        draftSeasons,
        expandedSeasonKey: draftSeasons[0]?.key || "",
        dirty: false
      })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleBack() {
    if (!this.data.dirty) {
      wx.navigateBack()
      return
    }
    this.setData({
      confirmDialogVisible: true,
      confirmDialogPurpose: "leave",
      confirmDialogContent: "当前修改尚未保存，确定放弃并返回吗？"
    })
  },

  handleConfirmCancel() {
    this.setData({ confirmDialogVisible: false, confirmDialogPurpose: "", confirmDialogContent: "" })
  },

  handleConfirmAction() {
    if (this.data.confirmDialogPurpose === "save") {
      void this.saveDrafts()
      return
    }
    this.handleConfirmCancel()
    wx.navigateBack()
  }
})

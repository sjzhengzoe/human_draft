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
import { createDragSortController, createDragSortData } from "../../../utils/drag-sort"
import { markMediaDataChanged } from "../../../utils/media-data-revision"

type DraftEpisode = {
  key: string
  id: string
  title: string
  plot_summary: string
  is_favorite: boolean
}

type DraftSeason = {
  key: string
  id: string
  name: string
  episodes: DraftEpisode[]
}

type FieldEditorPurpose = "" | "season-name" | "episode-count" | "episode-title" | "episode-summary"

let draftSequence = 0
const EPISODE_SUMMARY_MAX_LENGTH = 24
const EPISODE_TITLE_MAX_LENGTH = 120
const seasonDragSort = createDragSortController()
let managerScrollTop = 0
let lastDragTouchY = 0
let dragAutoScrollTimer: ReturnType<typeof setTimeout> | null = null

function clearDragAutoScroll() {
  if (dragAutoScrollTimer) clearTimeout(dragAutoScrollTimer)
  dragAutoScrollTimer = null
}

function draftKey(prefix: string) {
  draftSequence += 1
  return `${prefix}_${Date.now()}_${draftSequence}`
}

function createEpisodeDraft(id = "", title = "", plotSummary = "", isFavorite = false): DraftEpisode {
  return { key: id || draftKey("episode"), id, title, plot_summary: plotSummary, is_favorite: isFavorite }
}

function createSeasonDraft(season: MediaSeason): DraftSeason {
  return {
    key: season.id,
    id: season.id,
    name: season.name,
    episodes: season.episodes.map((episode) =>
      createEpisodeDraft(episode.id, episode.title, episode.plot_summary, episode.is_favorite)
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
    managerScrollTop: 0,
    ...createDragSortData(),
    deleteDialogVisible: false,
    pendingDeleteSeasonIndex: -1,
    confirmDialogVisible: false,
    confirmDialogPurpose: "" as "" | "save" | "leave",
    confirmDialogContent: "",
    fieldEditorVisible: false,
    fieldEditorPurpose: "" as FieldEditorPurpose,
    fieldEditorTitle: "",
    fieldEditorValue: "",
    fieldEditorType: "text",
    fieldEditorPlaceholder: "",
    fieldEditorMaxlength: 120,
    fieldEditorHint: "",
    fieldEditorShowCount: false,
    pendingSeasonIndex: -1,
    pendingEpisodeIndex: -1,
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    managerScrollTop = 0
    this.setData({ id: String(query.id || "") })
    void this.loadPage()
  },

  onUnload() {
    seasonDragSort.dispose()
    clearDragAutoScroll()
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

  handleManagerScroll(event: WechatMiniprogram.CustomEvent<{ scrollTop: number }>) {
    const nextScrollTop = Math.max(0, Number(event.detail.scrollTop) || 0)
    const scrollDelta = nextScrollTop - managerScrollTop
    managerScrollTop = nextScrollTop
    seasonDragSort.adjustForScroll(this, 0, scrollDelta)
  },

  scheduleDragAutoScroll() {
    clearDragAutoScroll()
    if (!seasonDragSort.isDragging()) return
    const windowHeight = wx.getSystemInfoSync().windowHeight
    const topEdge = 120
    const bottomEdge = windowHeight - 120
    const scrollDelta = lastDragTouchY < topEdge ? -18 : lastDragTouchY > bottomEdge ? 18 : 0
    if (!scrollDelta) return
    dragAutoScrollTimer = setTimeout(() => {
      dragAutoScrollTimer = null
      if (!seasonDragSort.isDragging()) return
      this.setData({ managerScrollTop: Math.max(0, managerScrollTop + scrollDelta) })
      this.scheduleDragAutoScroll()
    }, 48)
  },

  handleSeasonDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || seasonDragSort.isDragging()) return
    const index = Number(event.currentTarget.dataset.index)
    const season = this.data.draftSeasons[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!season || !touch) return
    lastDragTouchY = touch.clientY
    seasonDragSort.start(this, {
      items: this.data.draftSeasons,
      sourceIndex: index,
      keyOf: (item) => item.key,
      touch,
      selector: ".js-season-sort-anchor",
      layoutSelector: ".js-season-sort-item",
      kind: "season",
      contextKey: season.key,
      title: season.name || "未命名季",
      meta: `${season.episodes.length} 集`
    })
  },

  handleEpisodeDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || seasonDragSort.isDragging()) return
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    const season = this.data.draftSeasons[seasonIndex]
    const episode = season?.episodes[episodeIndex]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!season || !episode || !touch || season.episodes.length < 2) return
    lastDragTouchY = touch.clientY
    seasonDragSort.start(this, {
      items: season.episodes,
      sourceIndex: episodeIndex,
      keyOf: (item) => item.key,
      touch,
      selector: ".js-episode-sort-item",
      kind: "episode",
      contextKey: season.key,
      title: `第 ${episodeIndex + 1} 集`,
      meta: episode.plot_summary || "暂无剧情详情"
    })
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) return
    lastDragTouchY = touch.clientY
    seasonDragSort.move(this, event)
    this.scheduleDragAutoScroll()
  },

  handleSortDragEnd() {
    const kind = this.data.dragSortKind
    const seasonKey = this.data.dragSortContextKey
    clearDragAutoScroll()
    if (kind === "season") {
      const result = seasonDragSort.finish(this, this.data.draftSeasons, (item) => item.key)
      if (result) this.setData({ draftSeasons: result.items, dirty: true })
      return
    }
    if (kind === "episode") {
      const seasonIndex = this.data.draftSeasons.findIndex((season) => season.key === seasonKey)
      const season = this.data.draftSeasons[seasonIndex]
      if (season) {
        const result = seasonDragSort.finish(this, season.episodes, (item) => item.key)
        if (result) {
          this.setData({ [`draftSeasons[${seasonIndex}].episodes`]: result.items, dirty: true })
          return
        }
      }
    }
    seasonDragSort.cancel(this)
  },

  handleSeasonToggle(event: WechatMiniprogram.TouchEvent) {
    const key = String(event.currentTarget.dataset.key || "")
    this.setData({ expandedSeasonKey: this.data.expandedSeasonKey === key ? "" : key })
  },

  openFieldEditor(options: {
    purpose: FieldEditorPurpose
    title: string
    value: string
    type?: string
    placeholder?: string
    maxlength?: number
    hint?: string
    showCount?: boolean
    seasonIndex: number
    episodeIndex?: number
  }) {
    this.setData({
      fieldEditorVisible: true,
      fieldEditorPurpose: options.purpose,
      fieldEditorTitle: options.title,
      fieldEditorValue: options.value,
      fieldEditorType: options.type || "text",
      fieldEditorPlaceholder: options.placeholder || "",
      fieldEditorMaxlength: options.maxlength ?? 120,
      fieldEditorHint: options.hint || "",
      fieldEditorShowCount: options.showCount || false,
      pendingSeasonIndex: options.seasonIndex,
      pendingEpisodeIndex: options.episodeIndex ?? -1
    })
  },

  handleSeasonNameTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const season = this.data.draftSeasons[index]
    if (!season) return
    this.openFieldEditor({
      purpose: "season-name",
      title: "修改季名称",
      value: season.name,
      placeholder: "例如：第一季",
      maxlength: 80,
      seasonIndex: index
    })
  },

  resizeSeason(index: number, requestedCount: number) {
    const season = this.data.draftSeasons[index]
    const count = Math.max(0, Math.min(500, Math.trunc(requestedCount)))
    if (!season || !Number.isFinite(count) || count === season.episodes.length) return
    const episodes = season.episodes.slice(0, count)
    while (episodes.length < count) episodes.push(createEpisodeDraft())
    this.setData({ [`draftSeasons[${index}].episodes`]: episodes, dirty: true })
  },

  handleEpisodeCountTap(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const season = this.data.draftSeasons[index]
    if (!season) return
    this.openFieldEditor({
      purpose: "episode-count",
      title: "修改总集数",
      value: String(season.episodes.length),
      type: "number",
      placeholder: "请输入 0 到 500",
      maxlength: 3,
      hint: "减少集数会在最终保存时删除末尾单集",
      seasonIndex: index
    })
  },

  handleEpisodeSummaryTap(event: WechatMiniprogram.TouchEvent) {
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    const episode = this.data.draftSeasons[seasonIndex]?.episodes[episodeIndex]
    if (!episode) return
    this.openFieldEditor({
      purpose: "episode-summary",
      title: `第 ${episodeIndex + 1} 集剧情详情`,
      value: episode.plot_summary,
      placeholder: "用一句话记录本集剧情",
      maxlength: EPISODE_SUMMARY_MAX_LENGTH,
      showCount: true,
      seasonIndex,
      episodeIndex
    })
  },

  handleEpisodeTitleTap(event: WechatMiniprogram.TouchEvent) {
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    const episode = this.data.draftSeasons[seasonIndex]?.episodes[episodeIndex]
    if (!episode) return
    this.openFieldEditor({
      purpose: "episode-title",
      title: "修改单集名称",
      value: episode.title,
      placeholder: "不填写则显示默认集数",
      maxlength: EPISODE_TITLE_MAX_LENGTH,
      seasonIndex,
      episodeIndex
    })
  },

  handleFieldEditorCancel() {
    this.setData({
      fieldEditorVisible: false,
      fieldEditorPurpose: "",
      fieldEditorValue: "",
      fieldEditorHint: "",
      fieldEditorShowCount: false,
      pendingSeasonIndex: -1,
      pendingEpisodeIndex: -1
    })
  },

  handleFieldEditorConfirm(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    const purpose = this.data.fieldEditorPurpose
    const seasonIndex = this.data.pendingSeasonIndex
    const episodeIndex = this.data.pendingEpisodeIndex
    const season = this.data.draftSeasons[seasonIndex]
    if (!season) {
      this.handleFieldEditorCancel()
      return
    }

    const value = String(event.detail.value || "").trim()
    if (purpose === "season-name") {
      if (!value) {
        wx.showToast({ title: "请填写季名称", icon: "none" })
        return
      }
      if (value.length > 80) {
        wx.showToast({ title: "季名称不能超过 80 个字", icon: "none" })
        return
      }
      const duplicated = this.data.draftSeasons.some((item, index) =>
        index !== seasonIndex && item.name.trim().toLocaleLowerCase() === value.toLocaleLowerCase()
      )
      if (duplicated) {
        wx.showToast({ title: "季名称不能重复", icon: "none" })
        return
      }
      this.setData({ [`draftSeasons[${seasonIndex}].name`]: value, dirty: true })
      this.handleFieldEditorCancel()
      return
    }

    if (purpose === "episode-count") {
      if (!/^\d+$/.test(value)) {
        wx.showToast({ title: "总集数需为 0 到 500 的整数", icon: "none" })
        return
      }
      const count = Number(value)
      if (!Number.isInteger(count) || count < 0 || count > 500) {
        wx.showToast({ title: "总集数需为 0 到 500 的整数", icon: "none" })
        return
      }
      this.resizeSeason(seasonIndex, count)
      this.handleFieldEditorCancel()
      return
    }

    const episode = season.episodes[episodeIndex]
    if (!episode) {
      this.handleFieldEditorCancel()
      return
    }
    if (purpose === "episode-title") {
      if (value.length > EPISODE_TITLE_MAX_LENGTH) {
        wx.showToast({ title: `单集名称不能超过 ${EPISODE_TITLE_MAX_LENGTH} 个字`, icon: "none" })
        return
      }
      this.setData({ [`draftSeasons[${seasonIndex}].episodes[${episodeIndex}].title`]: value, dirty: true })
    } else if (purpose === "episode-summary") {
      if (value.length > EPISODE_SUMMARY_MAX_LENGTH) {
        wx.showToast({ title: `剧情详情不能超过 ${EPISODE_SUMMARY_MAX_LENGTH} 个字`, icon: "none" })
        return
      }
      this.setData({ [`draftSeasons[${seasonIndex}].episodes[${episodeIndex}].plot_summary`]: value, dirty: true })
    }
    this.handleFieldEditorCancel()
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
      if (season.episodes.some((episode) => episode.plot_summary.trim().length > EPISODE_SUMMARY_MAX_LENGTH)) {
        return `剧情详情不能超过 ${EPISODE_SUMMARY_MAX_LENGTH} 个字`
      }
      if (season.episodes.some((episode) => episode.title.trim().length > EPISODE_TITLE_MAX_LENGTH)) {
        return `单集名称不能超过 ${EPISODE_TITLE_MAX_LENGTH} 个字`
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
            title: episode.title.trim(),
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

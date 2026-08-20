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
import { findClosestSortTarget } from "../../../utils/drag-sort"
import type { SortableRect } from "../../../utils/drag-sort"
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

type SortDragKind = "season" | "episode"

type ActiveSortDrag = {
  kind: SortDragKind
  key: string
  seasonKey: string
  rect: SortableRect
  rects: SortableRect[]
  touchOffsetY: number
}

let draftSequence = 0
let sortDragSequence = 0
let activeSortDrag: ActiveSortDrag | null = null
let expandedSeasonBeforeDrag = ""
let managerScrollTop = 0
let lastDragTouchX = 0
let lastDragTouchY = 0
let dragAutoScrollTimer: ReturnType<typeof setTimeout> | null = null

function clearDragAutoScroll() {
  if (dragAutoScrollTimer) clearTimeout(dragAutoScrollTimer)
  dragAutoScrollTimer = null
}

function dragGhostStyle(touchY: number, touchOffsetY: number, rect: SortableRect) {
  return [
    `left:${rect.left}px`,
    `top:${touchY - touchOffsetY}px`,
    `width:${rect.right - rect.left}px`,
    `height:${rect.bottom - rect.top}px`
  ].join(";")
}

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
    managerScrollTop: 0,
    draggingKind: "" as "" | SortDragKind,
    draggingKey: "",
    dragGhostTitle: "",
    dragGhostMeta: "",
    dragGhostStyle: "",
    deleteDialogVisible: false,
    pendingDeleteSeasonIndex: -1,
    confirmDialogVisible: false,
    confirmDialogPurpose: "" as "" | "save" | "leave",
    confirmDialogContent: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    managerScrollTop = 0
    this.setData({ id: String(query.id || "") })
    void this.loadPage()
  },

  onUnload() {
    sortDragSequence += 1
    activeSortDrag = null
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
    if (!activeSortDrag || !scrollDelta) return
    activeSortDrag.rects = activeSortDrag.rects.map((rect) => ({
      ...rect,
      top: rect.top - scrollDelta,
      bottom: rect.bottom - scrollDelta
    }))
    this.updateSortDrag(lastDragTouchX, lastDragTouchY)
  },

  scheduleDragAutoScroll() {
    clearDragAutoScroll()
    if (!activeSortDrag) return
    const windowHeight = wx.getSystemInfoSync().windowHeight
    const topEdge = 120
    const bottomEdge = windowHeight - 120
    const scrollDelta = lastDragTouchY < topEdge ? -18 : lastDragTouchY > bottomEdge ? 18 : 0
    if (!scrollDelta) return
    dragAutoScrollTimer = setTimeout(() => {
      dragAutoScrollTimer = null
      if (!activeSortDrag) return
      this.setData({ managerScrollTop: Math.max(0, managerScrollTop + scrollDelta) })
      this.scheduleDragAutoScroll()
    }, 48)
  },

  updateSortDrag(clientX: number, clientY: number) {
    const drag = activeSortDrag
    if (!drag) return
    const targetIndex = findClosestSortTarget(drag.rects, clientX, clientY)
    const changes: Record<string, unknown> = {
      dragGhostStyle: dragGhostStyle(clientY, drag.touchOffsetY, drag.rect)
    }
    if (drag.kind === "season") {
      const currentIndex = this.data.draftSeasons.findIndex((season) => season.key === drag.key)
      if (currentIndex >= 0 && targetIndex >= 0 && targetIndex !== currentIndex) {
        const draftSeasons = [...this.data.draftSeasons]
        const [draggedSeason] = draftSeasons.splice(currentIndex, 1)
        draftSeasons.splice(targetIndex, 0, draggedSeason)
        changes.draftSeasons = draftSeasons
        changes.dirty = true
      }
    } else {
      const seasonIndex = this.data.draftSeasons.findIndex((season) => season.key === drag.seasonKey)
      const episodes = seasonIndex >= 0 ? [...this.data.draftSeasons[seasonIndex].episodes] : []
      const currentIndex = episodes.findIndex((episode) => episode.key === drag.key)
      if (seasonIndex >= 0 && currentIndex >= 0 && targetIndex >= 0 && targetIndex !== currentIndex) {
        const [draggedEpisode] = episodes.splice(currentIndex, 1)
        episodes.splice(targetIndex, 0, draggedEpisode)
        changes[`draftSeasons[${seasonIndex}].episodes`] = episodes
        changes.dirty = true
      }
    }
    this.setData(changes)
  },

  prepareSortDrag(
    kind: SortDragKind,
    key: string,
    seasonKey: string,
    touch: WechatMiniprogram.TouchDetail,
    selector: string,
    itemIndex: number,
    title: string,
    meta: string,
    preparationSequence?: number
  ) {
    const sequence = preparationSequence ?? ++sortDragSequence
    lastDragTouchX = touch.clientX
    lastDragTouchY = touch.clientY
    this.setData({
      draggingKind: kind,
      draggingKey: key,
      dragGhostTitle: title,
      dragGhostMeta: meta,
      dragGhostStyle: ""
    })
    wx.nextTick(() => {
      wx.createSelectorQuery()
        .in(this)
        .selectAll(selector)
        .boundingClientRect()
        .exec((results) => {
          if (sequence !== sortDragSequence || !isAsyncPageActive(this)) return
          const rects = (results[0] || []) as SortableRect[]
          const rect = rects[itemIndex]
          if (!rect || rects.length < 2) {
            this.finishSortDrag()
            return
          }
          activeSortDrag = {
            kind,
            key,
            seasonKey,
            rect,
            rects,
            touchOffsetY: touch.clientY - rect.top
          }
          this.setData({ dragGhostStyle: dragGhostStyle(touch.clientY, activeSortDrag.touchOffsetY, rect) })
          wx.vibrateShort({ type: "light" })
        })
    })
  },

  handleSeasonDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.draggingKind || this.data.draftSeasons.length < 2) return
    const index = Number(event.currentTarget.dataset.index)
    const season = this.data.draftSeasons[index]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!season || !touch) return
    expandedSeasonBeforeDrag = this.data.expandedSeasonKey
    const sequence = ++sortDragSequence
    this.setData({
      expandedSeasonKey: "",
      draggingKind: "season",
      draggingKey: season.key,
      dragGhostTitle: season.name || "未命名季",
      dragGhostMeta: `${season.episodes.length} 集`,
      dragGhostStyle: ""
    }, () => {
      if (sequence !== sortDragSequence) return
      this.prepareSortDrag(
        "season",
        season.key,
        season.key,
        touch,
        ".js-season-sort-item",
        index,
        season.name || "未命名季",
        `${season.episodes.length} 集`,
        sequence
      )
    })
  },

  handleEpisodeDragLongPress(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving || this.data.draggingKind) return
    const seasonIndex = Number(event.currentTarget.dataset.seasonIndex)
    const episodeIndex = Number(event.currentTarget.dataset.episodeIndex)
    const season = this.data.draftSeasons[seasonIndex]
    const episode = season?.episodes[episodeIndex]
    const touch = event.touches[0] || event.changedTouches[0]
    if (!season || !episode || !touch || season.episodes.length < 2) return
    this.prepareSortDrag(
      "episode",
      episode.key,
      season.key,
      touch,
      ".js-episode-sort-item",
      episodeIndex,
      `第 ${episodeIndex + 1} 集`,
      episode.plot_summary || "暂无剧情详情"
    )
  },

  handleSortDragMove(event: WechatMiniprogram.TouchEvent) {
    const touch = event.touches[0] || event.changedTouches[0]
    if (!activeSortDrag || !touch) return
    lastDragTouchX = touch.clientX
    lastDragTouchY = touch.clientY
    this.updateSortDrag(touch.clientX, touch.clientY)
    this.scheduleDragAutoScroll()
  },

  finishSortDrag() {
    sortDragSequence += 1
    const kind = this.data.draggingKind
    activeSortDrag = null
    clearDragAutoScroll()
    const changes: Record<string, unknown> = {
      draggingKind: "",
      draggingKey: "",
      dragGhostTitle: "",
      dragGhostMeta: "",
      dragGhostStyle: ""
    }
    if (kind === "season") changes.expandedSeasonKey = expandedSeasonBeforeDrag
    expandedSeasonBeforeDrag = ""
    this.setData(changes)
  },

  handleSortDragEnd() {
    this.finishSortDrag()
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

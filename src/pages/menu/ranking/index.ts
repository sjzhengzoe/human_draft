import { getMenuRanking } from "../../../services/menu"
import { getCurrentUser } from "../../../services/auth"
import type { MenuRankingItem } from "../../../types/api"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageRequestCurrent
} from "../../../utils/async-page"

type RankingDimension = "week" | "month" | "year"

function pad(value: number): string { return String(value).padStart(2, "0") }
function formatDate(date: Date): string { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` }
function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}
function addDays(value: string, amount: number): string {
  const date = parseDate(value); date.setDate(date.getDate() + amount); return formatDate(date)
}
function moveDate(value: string, dimension: RankingDimension, direction: number): string {
  const date = parseDate(value)
  if (dimension === "week") date.setDate(date.getDate() + direction * 7)
  else if (dimension === "month") date.setMonth(date.getMonth() + direction)
  else date.setFullYear(date.getFullYear() + direction)
  return formatDate(date)
}
function startOfWeek(value: string): string {
  const date = parseDate(value)
  date.setDate(date.getDate() + (date.getDay() === 0 ? -6 : 1 - date.getDay()))
  return formatDate(date)
}
function rangeFor(dimension: RankingDimension, anchor: string) {
  const date = parseDate(anchor)
  if (dimension === "week") {
    const start = startOfWeek(anchor)
    return { start, end: addDays(start, 6), label: `${start.slice(5).replace("-", ".")}—${addDays(start, 6).slice(5).replace("-", ".")}` }
  }
  if (dimension === "month") {
    return {
      start: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-01`,
      end: formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
      label: `${date.getFullYear()}年${date.getMonth() + 1}月`
    }
  }
  return { start: `${date.getFullYear()}-01-01`, end: `${date.getFullYear()}-12-31`, label: `${date.getFullYear()}年` }
}

Page({
  data: {
    dimension: "week" as RankingDimension,
    anchorDate: formatDate(new Date()),
    periodLabel: "",
    effectiveLabel: "",
    items: [] as MenuRankingItem[],
    loading: true,
    guestMode: false,
    errorMessage: ""
  },

  onLoad(query: Record<string, string | undefined>) {
    activateAsyncPage(this)
    const dimension = ["week", "month", "year"].includes(query.dimension || "")
      ? query.dimension as RankingDimension
      : "week"
    const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(query.date || "")
      ? query.date as string
      : formatDate(new Date())
    this.setData({ dimension, anchorDate }, () => {
      if (!getCurrentUser()) {
        const range = rangeFor(dimension, anchorDate)
        this.setData({
          periodLabel: range.label,
          effectiveLabel: "",
          items: [],
          loading: false,
          guestMode: true,
          errorMessage: ""
        })
        return
      }
      this.loadData()
    })
  },

  onShow() {
    activateAsyncPage(this)
    if (getCurrentUser() && this.data.guestMode) {
      this.setData({ guestMode: false }, () => this.loadData())
    }
  },

  onUnload() { deactivateAsyncPage(this) },

  async loadData() {
    if (!getCurrentUser()) {
      const range = rangeFor(this.data.dimension, this.data.anchorDate)
      this.setData({ periodLabel: range.label, effectiveLabel: "", items: [], loading: false })
      return
    }
    const generation = beginAsyncPageRequest(this)
    const range = rangeFor(this.data.dimension, this.data.anchorDate)
    this.setData({ loading: true, errorMessage: "", periodLabel: range.label })
    try {
      const result = await getMenuRanking(range.start, range.end)
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const effectiveLabel = result.effective_end < result.start
        ? "所选范围尚未开始"
        : `统计至 ${result.effective_end.slice(0, 10)}`
      this.setData({ items: result.items, effectiveLabel })
    } catch (error) {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ errorMessage: error instanceof Error ? error.message : "排行榜加载失败" })
      }
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) this.setData({ loading: false })
    }
  },

  handleDimensionTap(event: WechatMiniprogram.TouchEvent) {
    const dimension = String(event.currentTarget.dataset.dimension || "week") as RankingDimension
    if (!["week", "month", "year"].includes(dimension) || dimension === this.data.dimension) return
    this.setData({ dimension }, () => this.loadData())
  },

  handleMove(event: WechatMiniprogram.TouchEvent) {
    const direction = Number(event.currentTarget.dataset.direction) < 0 ? -1 : 1
    this.setData({ anchorDate: moveDate(this.data.anchorDate, this.data.dimension, direction) }, () => this.loadData())
  }
})

import { getProductAnalytics } from "../../../services/product-analytics"
import type {
  ProductAnalyticsDashboard,
  ProductAnalyticsModule,
  ProductAnalyticsSource
} from "../../../types/api"
import { UI_COLORS } from "../../../styles/colors"

const PERIODS = [
  { days: 7, label: "近 7 天" },
  { days: 30, label: "近 30 天" },
  { days: 90, label: "近 90 天" }
]

const MODULE_LABELS: Record<string, string> = {
  home: "首页",
  menu: "我的菜单",
  media: "影视片单",
  activities: "活动清单",
  chat_topics: "聊天话题",
  text_card: "图文卡片",
  exercise: "运动养宠",
  luggage: "行李清单",
  wardrobe: "衣物尺寸",
  key_moments: "人生节点",
  footprint: "全国足迹",
  profile: "我的"
}

function formatBytes(value: number): string {
  const bytes = Math.max(0, Number(value) || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function sourceLabel(item: ProductAnalyticsSource): string {
  if (item.source_campaign) return `活动 ${item.source_campaign}`
  if (item.source_referrer_app_id) return `小程序 ${item.source_referrer_app_id}`
  if (item.source_scene !== null) return `微信场景 ${item.source_scene}`
  return "历史账号或直接进入"
}

function moduleRows(items: ProductAnalyticsModule[]) {
  return items.map((item) => ({
    ...item,
    label: MODULE_LABELS[item.module] || item.module,
    uploadedBytesText: formatBytes(item.uploaded_bytes)
  }))
}

function dashboardState(dashboard: ProductAnalyticsDashboard) {
  const totals = dashboard.totals
  return {
    dashboard,
    loading: false,
    errorMessage: "",
    rangeText: `${dashboard.range.from} 至 ${dashboard.range.to}`,
    currentImageBytesText: formatBytes(dashboard.current.current_image_bytes),
    uploadedBytesText: formatBytes(totals.uploaded_bytes),
    summaryCards: [
      { key: "registrations", label: "新增用户", value: totals.registrations },
      { key: "active", label: "活跃人次", value: totals.active_users },
      { key: "creates", label: "创建成功", value: totals.content_creations },
      { key: "errors", label: "服务错误", value: totals.error_occurrences }
    ],
    moduleRows: moduleRows(dashboard.modules),
    sourceRows: dashboard.sources.map((item) => ({
      ...item,
      label: sourceLabel(item)
    })),
    dailyRows: [...dashboard.daily].reverse().map((item) => ({
      ...item,
      uploadedBytesText: formatBytes(item.uploaded_bytes)
    }))
  }
}

Component({
  data: {
    periods: PERIODS,
    selectedDays: 30,
    loading: true,
    errorMessage: "",
    rangeText: "",
    currentImageBytesText: "0 B",
    uploadedBytesText: "0 B",
    summaryCards: [] as Array<{ key: string; label: string; value: number }>,
    moduleRows: [] as Array<ProductAnalyticsModule & { label: string; uploadedBytesText: string }>,
    sourceRows: [] as Array<ProductAnalyticsSource & { label: string }>,
    dailyRows: [] as Array<ProductAnalyticsDashboard["daily"][number] & { uploadedBytesText: string }>,
    dashboard: null as ProductAnalyticsDashboard | null,
    themeColors: UI_COLORS
  },
  lifetimes: {
    attached() {
      void this.loadDashboard()
    }
  },
  methods: {
    async loadDashboard() {
      this.setData({ loading: true, errorMessage: "" })
      try {
        const dashboard = await getProductAnalytics(this.data.selectedDays)
        this.setData(dashboardState(dashboard))
      } catch (error) {
        this.setData({
          loading: false,
          errorMessage: error instanceof Error ? error.message : "运营数据读取失败"
        })
      }
    },
    handlePeriodTap(event: WechatMiniprogram.TouchEvent) {
      const days = Number(event.currentTarget.dataset.days)
      if (!Number.isInteger(days) || days === this.data.selectedDays) return
      this.setData({ selectedDays: days })
      void this.loadDashboard()
    },
    handleRetryTap() {
      void this.loadDashboard()
    }
  }
})

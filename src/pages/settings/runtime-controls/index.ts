import { getCurrentUser } from "../../../services/auth"
import {
  getRuntimeControlAdminState,
  updateRuntimeControl
} from "../../../services/runtime-controls"
import { UI_COLORS } from "../../../styles/colors"
import type {
  RuntimeControlAdminState,
  RuntimeControlAudit,
  RuntimeControlKey
} from "../../../types/api"

type AuditView = RuntimeControlAudit & {
  label: string
  stateText: string
  timeText: string
}

type RuntimeControlsPageInstance = WechatMiniprogram.Component.TrivialInstance & {
  loadState: () => Promise<void>
  openDialog: (key: RuntimeControlKey, enabled: boolean, title: string) => void
}

function formatShanghaiTime(value: string): string {
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return ""
  const shanghaiTime = new Date(time.getTime() + 8 * 60 * 60 * 1000)
  const pad = (number: number) => String(number).padStart(2, "0")
  return `${pad(shanghaiTime.getUTCMonth() + 1)}-${pad(shanghaiTime.getUTCDate())} ${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}`
}

function auditView(item: RuntimeControlAudit): AuditView {
  const registration = item.control_key === "registration_enabled"
  return {
    ...item,
    label: registration ? "新用户注册" : "业务写入",
    stateText: item.next_enabled
      ? registration ? "已开放" : "已恢复"
      : registration ? "已暂停" : "已设为只读",
    timeText: formatShanghaiTime(item.created_at)
  }
}

function stateView(state: RuntimeControlAdminState) {
  const registration = state.controls.registration_enabled
  const write = state.controls.write_enabled
  return {
    registrationEnabled: registration.enabled,
    registrationForced: registration.forced_by_environment,
    registrationUpdatedAt: formatShanghaiTime(registration.updated_at),
    writeEnabled: write.enabled,
    writeForced: write.forced_by_environment,
    writeUpdatedAt: formatShanghaiTime(write.updated_at),
    audits: state.audits.map(auditView)
  }
}

Page({
  data: {
    registrationEnabled: true,
    registrationForced: false,
    registrationUpdatedAt: "",
    writeEnabled: true,
    writeForced: false,
    writeUpdatedAt: "",
    audits: [] as AuditView[],
    loading: false,
    saving: false,
    dialogVisible: false,
    dialogTitle: "",
    dialogConfirmText: "确认",
    pendingKey: "" as RuntimeControlKey | "",
    pendingEnabled: true,
    reason: "",
    themeColors: UI_COLORS
  },

  onLoad() {
    if (!getCurrentUser()?.is_admin) {
      wx.showToast({ title: "只有管理员可以访问", icon: "none" })
      wx.navigateBack()
      return
    }
    void (this as unknown as RuntimeControlsPageInstance).loadState()
  },

  methods: {
    async loadState() {
      if (this.data.loading) return
      this.setData({ loading: true })
      try {
        const state = await getRuntimeControlAdminState()
        this.setData(stateView(state))
      } catch (_error) {
        wx.showToast({ title: "暂时无法读取运营状态", icon: "none" })
      } finally {
        this.setData({ loading: false })
      }
    },

    handleRegistrationAction() {
      if (this.data.registrationForced || this.data.loading || this.data.saving) return
      const nextEnabled = !this.data.registrationEnabled
      ;(this as unknown as RuntimeControlsPageInstance).openDialog(
        "registration_enabled",
        nextEnabled,
        nextEnabled ? "恢复新用户注册" : "暂停新用户注册"
      )
    },

    handleWriteAction() {
      if (this.data.writeForced || this.data.loading || this.data.saving) return
      const nextEnabled = !this.data.writeEnabled
      ;(this as unknown as RuntimeControlsPageInstance).openDialog(
        "write_enabled",
        nextEnabled,
        nextEnabled ? "恢复业务写入" : "进入紧急只读"
      )
    },

    openDialog(key: RuntimeControlKey, enabled: boolean, title: string) {
      this.setData({
        dialogVisible: true,
        dialogTitle: title,
        dialogConfirmText: title,
        pendingKey: key,
        pendingEnabled: enabled,
        reason: ""
      })
    },

    handleReasonInput(event: WechatMiniprogram.Input) {
      this.setData({ reason: event.detail.value })
    },

    handleDialogCancel() {
      if (this.data.saving) return
      this.setData({ dialogVisible: false, pendingKey: "", reason: "" })
    },

    async handleDialogConfirm() {
      const key = this.data.pendingKey
      const reason = this.data.reason.trim()
      if (!key || this.data.saving) return
      if (reason.length < 2) {
        wx.showToast({ title: "请填写操作原因", icon: "none" })
        return
      }
      this.setData({ saving: true })
      try {
        await updateRuntimeControl(key, this.data.pendingEnabled, reason)
        this.setData({ dialogVisible: false, pendingKey: "", reason: "" })
        await (this as unknown as RuntimeControlsPageInstance).loadState()
        wx.showToast({ title: "运营状态已更新", icon: "success" })
      } catch (error) {
        wx.showToast({
          title: error instanceof Error ? error.message : "更新失败，请重试",
          icon: "none"
        })
      } finally {
        this.setData({ saving: false })
      }
    }
  }
})

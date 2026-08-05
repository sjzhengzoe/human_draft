const QUICK_ACTIONS = [
  { key: "paste", label: "粘贴", icon: "clipboard-paste" },
  { key: "edit", label: "编辑", icon: "pencil" },
  { key: "export", label: "导出高清", icon: "download", primary: true },
  { key: "more", label: "更多", icon: "settings-2" }
]

const APPEND_ACTION = {
  key: "append",
  label: "追加",
  icon: "plus"
}

Component({
  data: {
    actions: QUICK_ACTIONS.map((action) => ({
      ...action,
      disabled: action.key === "export" || action.key === "more"
    })),
    showMoreDialog: false
  },

  properties: {
    disabled: {
      type: Boolean,
      value: false,
      observer: "syncActionStates"
    },
    hasContent: {
      type: Boolean,
      value: false,
      observer: "syncActionStates"
    },
    exportReady: {
      type: Boolean,
      value: false,
      observer: "syncActionStates"
    },
    showAppend: {
      type: Boolean,
      value: false,
      observer: "syncActionStates"
    },
    label: {
      type: String,
      value: "图文创作操作"
    }
  },

  methods: {
    syncActionStates() {
      const globallyDisabled = this.data.disabled
      const hasContent = this.data.hasContent
      const exportReady = this.data.exportReady
      const actions = this.data.showAppend
        ? [QUICK_ACTIONS[0], APPEND_ACTION, ...QUICK_ACTIONS.slice(1)]
        : QUICK_ACTIONS

      this.setData({
        actions: actions.map((action) => ({
          ...action,
          disabled:
            globallyDisabled ||
            (action.key === "more" && !hasContent) ||
            (action.key === "export" && !exportReady)
        })),
        showMoreDialog: globallyDisabled ? false : this.data.showMoreDialog
      })
    },

    handleActionTap(event: WechatMiniprogram.TouchEvent) {
      const key = event.currentTarget.dataset.key
      const action = this.data.actions.find((item) => item.key === key)
      if (!action || action.disabled) return

      if (key === "more") {
        this.setData({ showMoreDialog: true })
        return
      }

      this.triggerEvent("action", {
        key
      })
    },

    closeMoreDialog() {
      this.setData({ showMoreDialog: false })
    },

    handleMoreActionTap(event: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled || !this.data.hasContent) return
      const key = event.currentTarget.dataset.key
      if (key !== "copy" && key !== "clear") return

      this.setData({ showMoreDialog: false })
      this.triggerEvent("action", { key })
    }
  }
})

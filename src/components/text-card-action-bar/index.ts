const BASE_ACTIONS = [
  { key: "paste", label: "粘贴", icon: "clipboard-paste" },
  { key: "copy", label: "复制", icon: "copy" },
  { key: "edit", label: "编辑", icon: "pencil" },
  { key: "clear", label: "清空", icon: "eraser" },
  { key: "export", label: "导出高清", icon: "download", primary: true }
]

const APPEND_ACTION = {
  key: "append",
  label: "追加",
  icon: "plus"
}

Component({
  data: {
    actions: BASE_ACTIONS.map((action) => ({
      ...action,
      disabled:
        action.key === "copy" ||
        action.key === "clear" ||
        action.key === "export"
    }))
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
        ? [BASE_ACTIONS[0], APPEND_ACTION, ...BASE_ACTIONS.slice(1)]
        : BASE_ACTIONS

      this.setData({
        actions: actions.map((action) => ({
          ...action,
          disabled:
            globallyDisabled ||
            ((action.key === "copy" || action.key === "clear") && !hasContent) ||
            (action.key === "export" && !exportReady)
        }))
      })
    },

    handleActionTap(event: WechatMiniprogram.TouchEvent) {
      const key = event.currentTarget.dataset.key
      const action = this.data.actions.find((item) => item.key === key)
      if (!action || action.disabled) return

      this.triggerEvent("action", {
        key
      })
    }
  }
})

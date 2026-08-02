Component({
  data: {
    actions: [
      { key: "paste", label: "粘贴", icon: "clipboard-paste", disabled: false },
      { key: "copy", label: "复制", icon: "copy", disabled: true },
      { key: "edit", label: "编辑", icon: "pencil", disabled: false },
      { key: "clear", label: "清空", icon: "eraser", disabled: true },
      { key: "export", label: "导出", icon: "download", disabled: true }
    ]
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

      this.setData({
        actions: this.data.actions.map((action) => ({
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

Component({
  data: {
    actions: [
      { key: "paste", label: "粘贴", icon: "clipboard-paste" },
      { key: "copy", label: "复制", icon: "copy" },
      { key: "edit", label: "编辑", icon: "pencil" },
      { key: "clear", label: "清空", icon: "eraser" },
      { key: "export", label: "导出", icon: "download" }
    ]
  },

  properties: {
    disabled: {
      type: Boolean,
      value: false
    },
    label: {
      type: String,
      value: "图文创作操作"
    }
  },

  methods: {
    handleActionTap(event: WechatMiniprogram.TouchEvent) {
      if (this.data.disabled) return

      this.triggerEvent("action", {
        key: event.currentTarget.dataset.key
      })
    }
  }
})

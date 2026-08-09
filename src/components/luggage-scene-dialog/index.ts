Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    saving: {
      type: Boolean,
      value: false
    }
  },

  data: {
    name: "",
    canSave: false
  },

  methods: {
    handleNameInput(event: WechatMiniprogram.Input) {
      const name = event.detail.value
      this.setData({ name, canSave: Boolean(name.trim()) })
    },

    handleCancel() {
      if (!this.properties.saving) this.triggerEvent("cancel")
    },

    handleConfirm() {
      const name = this.data.name.trim()
      if (!name) {
        wx.showToast({ title: "请输入场景名称", icon: "none" })
        return
      }
      if (!this.properties.saving) this.triggerEvent("confirm", { name })
    }
  }
})

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    saving: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: "新增行李场景"
    },
    confirmText: {
      type: String,
      value: "创建"
    },
    initialName: {
      type: String,
      value: ""
    },
    deletable: {
      type: Boolean,
      value: false
    }
  },

  data: {
    name: "",
    canSave: false
  },

  observers: {
    initialName(initialName: string) {
      this.setData({
        name: initialName,
        canSave: Boolean(initialName.trim())
      })
    }
  },

  methods: {
    handleNameInput(event: WechatMiniprogram.Input) {
      const name = event.detail.value
      this.setData({ name, canSave: Boolean(name.trim()) })
    },

    handleCancel() {
      if (!this.properties.saving) this.triggerEvent("cancel")
    },

    handleDelete() {
      if (!this.properties.saving && this.properties.deletable) this.triggerEvent("delete")
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

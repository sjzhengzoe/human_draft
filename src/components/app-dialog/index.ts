Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: ""
    },
    content: {
      type: String,
      value: ""
    },
    cancelText: {
      type: String,
      value: "取消"
    },
    confirmText: {
      type: String,
      value: "确定"
    }
  },
  methods: {
    noop() {},
    handleCancel() {
      this.triggerEvent("cancel")
    },
    handleConfirm() {
      this.triggerEvent("confirm")
    }
  }
})

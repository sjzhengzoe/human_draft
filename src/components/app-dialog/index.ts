Component({
  options: {
    multipleSlots: true
  },
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
    },
    customBody: {
      type: Boolean,
      value: false
    },
    customActions: {
      type: Boolean,
      value: false
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

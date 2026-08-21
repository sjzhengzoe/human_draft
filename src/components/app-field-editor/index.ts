Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: "修改内容"
    },
    value: {
      type: String,
      value: ""
    },
    type: {
      type: String,
      value: "text"
    },
    placeholder: {
      type: String,
      value: "请输入内容"
    },
    maxlength: {
      type: Number,
      value: 120
    },
    confirmText: {
      type: String,
      value: "保存"
    },
    hint: {
      type: String,
      value: ""
    },
    showCount: {
      type: Boolean,
      value: false
    }
  },
  data: {
    draftValue: ""
  },
  observers: {
    "visible, value"(visible: boolean, value: string) {
      if (visible && value !== this.data.draftValue) this.setData({ draftValue: value })
    }
  },
  methods: {
    handleInput(event: WechatMiniprogram.Input) {
      this.setData({ draftValue: event.detail.value })
    },
    handleCancel() {
      this.triggerEvent("cancel")
    },
    handleConfirm() {
      this.triggerEvent("confirm", { value: this.data.draftValue })
    }
  }
})

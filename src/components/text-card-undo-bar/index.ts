Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    message: {
      type: String,
      value: "内容已清空"
    }
  },
  methods: {
    handleUndo() {
      this.triggerEvent("undo")
    }
  }
})

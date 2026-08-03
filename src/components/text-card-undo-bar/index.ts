Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    handleUndo() {
      this.triggerEvent("undo")
    }
  }
})

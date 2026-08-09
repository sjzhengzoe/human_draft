type KeyboardHeightEvent = { height: number }
type KeyboardHeightHandler = (event: KeyboardHeightEvent) => void

const keyboardHandlers = new WeakMap<object, KeyboardHeightHandler>()

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
  data: {
    keyboardHeight: 0,
    keyboardStyle: ""
  },
  observers: {
    visible(visible: boolean) {
      if (visible) {
        this.startKeyboardTracking()
      } else {
        this.stopKeyboardTracking()
      }
    }
  },
  lifetimes: {
    attached() {
      if (this.properties.visible) this.startKeyboardTracking()
    },
    detached() {
      this.stopKeyboardTracking()
    }
  },
  methods: {
    startKeyboardTracking() {
      if (keyboardHandlers.has(this)) return
      const handler: KeyboardHeightHandler = ({ height }) => {
        const keyboardHeight = Math.max(0, Number(height || 0))
        if (!this.properties.visible || keyboardHeight === this.data.keyboardHeight) return
        this.setData({
          keyboardHeight,
          keyboardStyle: keyboardHeight > 0
            ? `padding-bottom: calc(${keyboardHeight}px + 48rpx);`
            : ""
        })
      }
      keyboardHandlers.set(this, handler)
      wx.onKeyboardHeightChange(handler)
    },
    stopKeyboardTracking() {
      const handler = keyboardHandlers.get(this)
      if (handler) {
        wx.offKeyboardHeightChange(handler)
        keyboardHandlers.delete(this)
      }
      if (this.data.keyboardHeight > 0) {
        this.setData({ keyboardHeight: 0, keyboardStyle: "" })
      }
    },
    noop() {},
    handleCancel() {
      this.triggerEvent("cancel")
    },
    handleConfirm() {
      this.triggerEvent("confirm")
    }
  }
})

type AppDialogInstance = WechatMiniprogram.Component.TrivialInstance & {
  keyboardHeightHandler?: (result: WechatMiniprogram.OnKeyboardHeightChangeCallbackResult) => void
}

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
    },
    fullscreen: {
      type: Boolean,
      value: false
    },
    placement: {
      type: String,
      value: "center"
    }
  },
  data: {
    keyboardHeight: 0
  },
  observers: {
    "visible, placement"(visible: boolean, placement: string) {
      if ((!visible || placement !== "bottom") && this.data.keyboardHeight) {
        this.setData({ keyboardHeight: 0 })
      }
    }
  },
  lifetimes: {
    attached() {
      const component = this as AppDialogInstance
      component.keyboardHeightHandler = ({ height }) => {
        if (!this.properties.visible || this.properties.placement !== "bottom") return
        const keyboardHeight = Math.max(0, Number(height) || 0)
        if (keyboardHeight !== this.data.keyboardHeight) this.setData({ keyboardHeight })
      }
      wx.onKeyboardHeightChange(component.keyboardHeightHandler)
    },
    detached() {
      const component = this as AppDialogInstance
      if (component.keyboardHeightHandler) {
        wx.offKeyboardHeightChange(component.keyboardHeightHandler)
        component.keyboardHeightHandler = undefined
      }
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

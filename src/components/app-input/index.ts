import { UI_FONT_SIZES } from "../../styles/typography"

Component({
  externalClasses: ["custom-class"],
  properties: {
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
      value: ""
    },
    maxlength: {
      type: Number,
      value: 140
    },
    name: {
      type: String,
      value: ""
    },
    confirmType: {
      type: String,
      value: "done"
    },
    confirmHold: {
      type: Boolean,
      value: false
    },
    focus: {
      type: Boolean,
      value: false
    },
    adjustPosition: {
      type: Boolean,
      value: true
    },
    cursorSpacing: {
      type: Number,
      value: 0
    },
    disabled: {
      type: Boolean,
      value: false
    }
  },
  data: {
    fontSize: UI_FONT_SIZES.base,
    localValue: "",
    editing: false,
    nativeFocus: false
  },
  observers: {
    value(value: string) {
      if (value !== this.data.localValue) this.setData({ localValue: value })
    },
    focus(focus: boolean) {
      if (focus && !this.properties.disabled) {
        this.setData({ editing: true, nativeFocus: true })
      }
    }
  },
  lifetimes: {
    attached() {
      this.setData({
        localValue: this.properties.value,
        editing: this.properties.focus && !this.properties.disabled,
        nativeFocus: this.properties.focus && !this.properties.disabled
      })
    }
  },
  methods: {
    handleActivate() {
      if (this.properties.disabled) return
      this.setData({ editing: true, nativeFocus: true })
    },
    handleInput(event: WechatMiniprogram.Input) {
      this.setData({ localValue: event.detail.value })
      this.triggerEvent("input", event.detail)
    },
    handleFocus(event: WechatMiniprogram.InputFocus) {
      this.setData({ editing: true, nativeFocus: true })
      this.triggerEvent("focus", event.detail)
    },
    handleBlur(event: WechatMiniprogram.InputBlur) {
      this.setData({
        localValue: event.detail.value,
        editing: false,
        nativeFocus: false
      })
      this.triggerEvent("blur", event.detail)
    },
    handleConfirm(event: WechatMiniprogram.InputConfirm) {
      this.setData({ localValue: event.detail.value })
      this.triggerEvent("confirm", event.detail)
      if (!this.properties.confirmHold) {
        this.setData({ editing: false, nativeFocus: false })
      }
    }
  }
})

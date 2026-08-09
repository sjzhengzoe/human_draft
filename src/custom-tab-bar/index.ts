import { UI_FONT_SIZES } from "../styles/typography"

Component({
  data: {
    selected: 0,
    hidden: false,
    masked: false,
    fontSize: UI_FONT_SIZES.base,
    tabs: [
      {
        pagePath: "/pages/create/index",
        text: "首页",
        icon: "house"
      },
      {
        pagePath: "/pages/settings/index",
        text: "我的",
        icon: "user-round"
      }
    ]
  },
  methods: {
    noop() {},
    handleSwitch(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = this.data.tabs[index]

      if (!tab || index === this.data.selected) return

      wx.switchTab({
        url: tab.pagePath
      })
    }
  }
})

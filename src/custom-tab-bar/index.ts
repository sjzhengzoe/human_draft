import { UI_FONT_SIZES } from "../styles/typography"
import { UI_COLORS } from "../styles/colors"

Component({
  data: {
    selected: 0,
    hidden: false,
    masked: false,
    fontSize: UI_FONT_SIZES.base,
    themeColors: UI_COLORS,
    tabs: [
      {
        pagePath: "/pages/create/index",
        text: "首页",
        icon: "house",
        mutedIcon: "house-muted"
      },
      {
        pagePath: "/pages/settings/index",
        text: "我的",
        icon: "user-round",
        mutedIcon: "user-round-muted"
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

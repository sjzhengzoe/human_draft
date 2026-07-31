Component({
  data: {
    selected: 0,
    tabs: [
      {
        pagePath: "/pages/create/index",
        text: "首页",
        icon: "layout-grid"
      },
      {
        pagePath: "/pages/settings/index",
        text: "我的",
        icon: "user-round"
      }
    ]
  },
  methods: {
    handleSwitch(event) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = this.data.tabs[index]

      if (!tab || index === this.data.selected) return

      wx.switchTab({
        url: tab.pagePath
      })
    }
  }
})

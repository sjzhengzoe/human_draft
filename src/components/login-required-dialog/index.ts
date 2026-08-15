Component({
  data: {
    visible: false,
    navigating: false
  },
  methods: {
    open() {
      if (!this.data.navigating) this.setData({ visible: true })
    },
    handleCancel() {
      if (!this.data.navigating) this.setData({ visible: false })
    },
    handleConfirm() {
      if (this.data.navigating) return
      this.setData({ visible: false, navigating: true })
      wx.navigateTo({
        url: "/pages/login/index?return=1",
        fail: () => {
          this.setData({ navigating: false })
          wx.showToast({ title: "暂时无法打开，请重试", icon: "none" })
        },
        complete: () => this.setData({ navigating: false })
      })
    }
  }
})

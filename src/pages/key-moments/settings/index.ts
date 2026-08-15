import { ensureLogin, getCurrentUser } from "../../../services/auth"
import {
  DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT,
  getKeyMomentDisplayLayout,
  isKeyMomentDisplayLayout,
  setKeyMomentDisplayLayout
} from "../../../utils/key-moment-settings"
import type { KeyMomentDisplayLayout } from "../../../utils/key-moment-settings"

function loadUserLayout(page: WechatMiniprogram.Page.Instance<WechatMiniprogram.IAnyObject, WechatMiniprogram.IAnyObject>, uid: string) {
  page.setData({
    uid,
    activeLayout: getKeyMomentDisplayLayout(uid),
    ready: true
  })
}

Page({
  data: {
    ready: false,
    uid: "",
    activeLayout: DEFAULT_KEY_MOMENT_DISPLAY_LAYOUT as KeyMomentDisplayLayout,
    layoutOptions: [
      {
        value: "horizontal" as KeyMomentDisplayLayout,
        title: "横向图文",
        description: "图片在左，文字在右，浏览更紧凑"
      },
      {
        value: "vertical" as KeyMomentDisplayLayout,
        title: "上图下文",
        description: "图片按原比例完整展示，更适合看照片"
      }
    ]
  },

  onLoad() {
    const user = getCurrentUser()
    if (user) {
      loadUserLayout(this, user.uid)
      return
    }

    ensureLogin()
      .then((session) => loadUserLayout(this, session.user.uid))
      .catch(() => undefined)
  },

  handleLayoutTap(event: WechatMiniprogram.TouchEvent) {
    const layout = event.currentTarget.dataset.value
    if (
      !this.data.ready
      || !this.data.uid
      || !isKeyMomentDisplayLayout(layout)
      || layout === this.data.activeLayout
    ) return

    if (!setKeyMomentDisplayLayout(this.data.uid, layout)) {
      wx.showToast({ title: "保存失败，请重试", icon: "none" })
      return
    }

    this.setData({ activeLayout: layout })
    wx.showToast({ title: "已保存", icon: "success" })
  }
})

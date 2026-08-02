import { ensureLogin } from "../../services/auth"
import {
  addOfficialChatTopic,
  createOfficialChatTopic,
  createUserChatTopic,
  deleteOfficialChatTopic,
  deleteUserChatTopic,
  hideOfficialChatTopic,
  listChatTopics,
  listHiddenOfficialChatTopics,
  randomOfficialChatTopics,
  restoreOfficialChatTopic,
  updateOfficialChatTopic,
  updateUserChatTopic
} from "../../services/chat-topics"
import type {
  OfficialChatTopic,
  OfficialChatTopicView,
  UserChatTopic
} from "../../types/chat-topics"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

const RANDOM_TOPIC_COUNT = 3
const OFFICIAL_PAGE_SIZE = 6

type RandomTopicSource = "official" | "mine"
type TopicTab = "official" | "mine" | "hidden"

type RandomDialogTopic = {
  id: string
  content: string
  meta: string
}

function withAddedState(
  officialItems: OfficialChatTopic[],
  myItems: UserChatTopic[]
): OfficialChatTopicView[] {
  const addedIds = new Set(
    myItems.map((item) => item.official_topic_id).filter((id): id is string => Boolean(id))
  )
  return officialItems.map((item) => ({ ...item, is_added: addedIds.has(item.id) }))
}

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    result[index] = result[target]
    result[target] = current
  }
  return result
}

function randomTopics<T extends { id: string }>(
  items: T[],
  previousIds: string[] = []
): T[] {
  const count = Math.min(RANDOM_TOPIC_COUNT, items.length)
  const next = shuffled(items).slice(0, count)
  if (
    items.length > count &&
    next.length > 0 &&
    next.every((item) => previousIds.includes(item.id))
  ) {
    const replacement = items.find((item) => !previousIds.includes(item.id))
    if (replacement) next[next.length - 1] = replacement
  }
  return next
}

function toRandomDialogTopics(
  items: Array<{ id: string; content: string; official_topic_id?: string | null }>,
  source: RandomTopicSource,
  previousIds: string[] = []
): RandomDialogTopic[] {
  return randomTopics(items, previousIds).map((item) => ({
    id: item.id,
    content: item.content,
    meta:
      source === "official"
        ? "官方话题"
        : item.official_topic_id
          ? "官方收录"
          : "自建话题"
  }))
}

Page({
  data: {
    activeTab: "official" as TopicTab,
    officialItems: [] as OfficialChatTopicView[],
    myItems: [] as UserChatTopic[],
    officialPage: 1,
    officialTotal: 0,
    officialTotalPages: 1,
    loadingOfficialPage: false,
    hiddenItems: [] as OfficialChatTopic[],
    hiddenPage: 1,
    hiddenTotal: 0,
    hiddenTotalPages: 1,
    hiddenHasLoaded: false,
    loadingHiddenPage: false,
    restoringOfficialId: "",
    showRandomDialog: false,
    randomDialogSource: "official" as RandomTopicSource,
    randomDialogItems: [] as RandomDialogTopic[],
    randomLoading: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    canWrite: false,
    isAdmin: false,
    addingOfficialId: "",
    showOfficialEditor: false,
    editingOfficialId: "",
    officialEditorContent: "",
    officialSaving: false,
    showOfficialDeleteConfirm: false,
    deletingOfficialId: "",
    officialDeleting: false,
    hidingOfficialId: "",
    showEditor: false,
    editingId: "",
    editorContent: "",
    saving: false,
    showDeleteConfirm: false,
    deletingId: "",
    deleting: false
  },

  onLoad() {
    activateAsyncPage(this)
  },

  onShow() {
    this.loadTopics()
  },

  onUnload() {
    deactivateAsyncPage(this)
  },

  async loadTopics() {
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading
    })
    try {
      const session = await ensureLogin()
      const { officialItems, officialPagination, myItems } = await listChatTopics(
        1,
        OFFICIAL_PAGE_SIZE
      )
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const officialViews = withAddedState(officialItems, myItems)
      this.setData({
        officialItems: officialViews,
        myItems,
        officialPage: officialPagination.page,
        officialTotal: officialPagination.total,
        officialTotalPages: officialPagination.total_pages,
        canWrite: session.user.can_write,
        isAdmin: session.user.is_admin
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({
        title: error instanceof Error ? error.message : "加载失败",
        icon: "none"
      })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab as TopicTab
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
    if (tab === "hidden" && !this.data.hiddenHasLoaded) {
      void this.loadHiddenPage(1)
    }
  },

  async handleRandom() {
    if (this.data.contentLoading || this.data.randomLoading || this.data.officialTotal === 0) return
    this.setData({ randomLoading: true })
    try {
      const items = await randomOfficialChatTopics()
      if (!isAsyncPageActive(this)) return
      this.setData({
        showRandomDialog: true,
        randomDialogSource: "official",
        randomDialogItems: toRandomDialogTopics(items, "official")
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "随机失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ randomLoading: false })
    }
  },

  handleMyRandom() {
    if (this.data.contentLoading || this.data.myItems.length === 0) return
    this.setData({
      showRandomDialog: true,
      randomDialogSource: "mine",
      randomDialogItems: toRandomDialogTopics(this.data.myItems, "mine")
    })
  },

  async handleRandomAgain() {
    const source = this.data.randomDialogSource
    if (this.data.randomLoading) return
    if (source === "official") {
      this.setData({ randomLoading: true })
      try {
        const items = await randomOfficialChatTopics()
        if (isAsyncPageActive(this)) {
          this.setData({ randomDialogItems: toRandomDialogTopics(items, "official") })
        }
      } catch (error) {
        if (isAsyncPageActive(this)) {
          wx.showToast({
            title: error instanceof Error ? error.message : "随机失败",
            icon: "none"
          })
        }
      } finally {
        if (isAsyncPageActive(this)) this.setData({ randomLoading: false })
      }
      return
    }
    if (this.data.myItems.length === 0) return
    this.setData({
      randomDialogItems: toRandomDialogTopics(
        this.data.myItems,
        "mine",
        this.data.randomDialogItems.map((item) => item.id)
      )
    })
  },

  async loadOfficialPage(page: number) {
    if (this.data.loadingOfficialPage) return
    this.setData({ loadingOfficialPage: true })
    try {
      const { officialItems, officialPagination, myItems } = await listChatTopics(
        page,
        OFFICIAL_PAGE_SIZE
      )
      if (!isAsyncPageActive(this)) return
      this.setData({
        officialItems: withAddedState(officialItems, myItems),
        myItems,
        officialPage: officialPagination.page,
        officialTotal: officialPagination.total,
        officialTotalPages: officialPagination.total_pages
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "翻页失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ loadingOfficialPage: false })
    }
  },

  handleOfficialPageChange(event: WechatMiniprogram.TouchEvent) {
    const page = Number(event.currentTarget.dataset.page)
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.data.officialTotalPages ||
      page === this.data.officialPage
    ) return
    void this.loadOfficialPage(page)
  },

  async loadHiddenPage(page: number) {
    if (this.data.loadingHiddenPage) return
    this.setData({ loadingHiddenPage: true })
    try {
      const { items, pagination } = await listHiddenOfficialChatTopics(
        page,
        OFFICIAL_PAGE_SIZE
      )
      if (!isAsyncPageActive(this)) return
      this.setData({
        hiddenItems: items,
        hiddenPage: pagination.page,
        hiddenTotal: pagination.total,
        hiddenTotalPages: pagination.total_pages,
        hiddenHasLoaded: true
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加载隐藏话题失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ loadingHiddenPage: false })
    }
  },

  handleHiddenPageChange(event: WechatMiniprogram.TouchEvent) {
    const page = Number(event.currentTarget.dataset.page)
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > this.data.hiddenTotalPages ||
      page === this.data.hiddenPage
    ) return
    void this.loadHiddenPage(page)
  },

  async handleRestoreOfficial(event: WechatMiniprogram.TouchEvent) {
    if (this.data.restoringOfficialId) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ restoringOfficialId: id })
    try {
      await restoreOfficialChatTopic(id)
      if (!isAsyncPageActive(this)) return
      await this.loadHiddenPage(this.data.hiddenPage)
      await this.loadOfficialPage(this.data.officialPage)
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "恢复失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ restoringOfficialId: "" })
    }
  },

  closeRandomDialog() {
    this.setData({ showRandomDialog: false, randomDialogItems: [] })
  },

  handleAddOfficialOpen() {
    if (!this.data.isAdmin || this.data.contentLoading) return
    this.setData({
      showOfficialEditor: true,
      editingOfficialId: "",
      officialEditorContent: ""
    })
  },

  handleEditOfficial(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.isAdmin || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.officialItems.find((topic) => topic.id === id)
    if (!item) return
    this.setData({
      showOfficialEditor: true,
      editingOfficialId: item.id,
      officialEditorContent: item.content
    })
  },

  handleOfficialEditorInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ officialEditorContent: event.detail.value })
  },

  closeOfficialEditor() {
    if (!this.data.officialSaving) {
      this.setData({
        showOfficialEditor: false,
        editingOfficialId: "",
        officialEditorContent: ""
      })
    }
  },

  async saveOfficialEditor() {
    const content = this.data.officialEditorContent.trim()
    if (!content || this.data.officialSaving || !this.data.isAdmin) return
    const isEditing = Boolean(this.data.editingOfficialId)
    this.setData({ officialSaving: true })
    try {
      const item = this.data.editingOfficialId
        ? await updateOfficialChatTopic(this.data.editingOfficialId, content)
        : await createOfficialChatTopic(content)
      if (!isAsyncPageActive(this)) return
      this.setData({
        showOfficialEditor: false,
        editingOfficialId: "",
        officialEditorContent: ""
      })
      if (isEditing) {
        this.setData({
          officialItems: this.data.officialItems.map((topic) =>
            topic.id === item.id ? { ...item, is_added: topic.is_added } : topic
          )
        })
      } else {
        await this.loadOfficialPage(this.data.officialPage)
      }
      wx.showToast({
        title: isEditing ? "官方话题已更新" : "官方话题已添加",
        icon: "success"
      })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "添加失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ officialSaving: false })
    }
  },

  handleOfficialDeleteOpen(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.isAdmin || this.data.officialDeleting) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ showOfficialDeleteConfirm: true, deletingOfficialId: id })
  },

  handleOfficialDeleteCancel() {
    if (!this.data.officialDeleting) {
      this.setData({ showOfficialDeleteConfirm: false, deletingOfficialId: "" })
    }
  },

  async handleOfficialDeleteConfirm() {
    const id = this.data.deletingOfficialId
    if (!id || !this.data.isAdmin || this.data.officialDeleting) return
    this.setData({ officialDeleting: true })
    try {
      await deleteOfficialChatTopic(id)
      if (!isAsyncPageActive(this)) return
      this.setData({
        showOfficialDeleteConfirm: false,
        deletingOfficialId: ""
      })
      await this.loadOfficialPage(this.data.officialPage)
      wx.showToast({ title: "官方话题已删除", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ officialDeleting: false })
    }
  },

  async handleDislikeOfficial(event: WechatMiniprogram.TouchEvent) {
    if (this.data.hidingOfficialId) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ hidingOfficialId: id })
    try {
      await hideOfficialChatTopic(id)
      if (!isAsyncPageActive(this)) return
      this.setData({ hiddenHasLoaded: false })
      await this.loadOfficialPage(this.data.officialPage)
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "操作失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ hidingOfficialId: "" })
    }
  },

  handleCopyOfficial(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.officialItems.find((topic) => topic.id === id)
    if (!item) return
    this.setData({
      showEditor: true,
      editingId: "",
      editorContent: item.content
    })
  },

  async handleAddOfficial(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.addingOfficialId || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const topic = this.data.officialItems.find((item) => item.id === id)
    if (!topic) return
    this.setData({ addingOfficialId: id })
    try {
      await addOfficialChatTopic(id)
      if (!isAsyncPageActive(this)) return
      await this.loadOfficialPage(this.data.officialPage)
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "收藏失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ addingOfficialId: "" })
    }
  },

  handleAddMine() {
    if (!this.data.canWrite || this.data.contentLoading) return
    this.setData({
      showEditor: true,
      editingId: "",
      editorContent: ""
    })
  },

  handleEditMine(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const item = this.data.myItems.find((topic) => topic.id === id)
    if (!item) return
    this.setData({
      showEditor: true,
      editingId: item.id,
      editorContent: item.content
    })
  },

  handleEditorInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({ editorContent: event.detail.value })
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ showEditor: false })
  },

  async saveEditor() {
    const content = this.data.editorContent.trim()
    if (!content || this.data.saving) return
    this.setData({ saving: true })
    try {
      const item = this.data.editingId
        ? await updateUserChatTopic(this.data.editingId, content)
        : await createUserChatTopic(content)
      if (!isAsyncPageActive(this)) return
      const myItems = this.data.editingId
        ? this.data.myItems.map((topic) => (topic.id === item.id ? item : topic))
        : [item, ...this.data.myItems]
      this.setData({
        showEditor: false,
        myItems
      })
      wx.showToast({ title: "已保存", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleDeleteMine(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    if (!id) return
    this.setData({ showDeleteConfirm: true, deletingId: id })
  },

  handleDeleteCancel() {
    if (!this.data.deleting) {
      this.setData({ showDeleteConfirm: false, deletingId: "" })
    }
  },

  async handleDeleteConfirm() {
    const id = this.data.deletingId
    if (!id || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await deleteUserChatTopic(id)
      if (!isAsyncPageActive(this)) return
      const myItems = this.data.myItems.filter((item) => item.id !== id)
      const officialItems = withAddedState(this.data.officialItems, myItems)
      this.setData({
        showDeleteConfirm: false,
        deletingId: "",
        myItems,
        officialItems
      })
      await this.loadOfficialPage(this.data.officialPage)
      wx.showToast({ title: "已删除", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "删除失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  }
})

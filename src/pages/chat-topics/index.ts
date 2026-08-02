import { ensureLogin } from "../../services/auth"
import {
  addOfficialChatTopic,
  createUserChatTopic,
  deleteUserChatTopic,
  listChatTopics,
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

function randomTopics(
  items: OfficialChatTopicView[],
  previousIds: string[] = []
): OfficialChatTopicView[] {
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

function retainOrPickRandomTopics(
  items: OfficialChatTopicView[],
  preferredIds: string[]
): OfficialChatTopicView[] {
  const preferred = preferredIds
    .map((id) => items.find((item) => item.id === id))
    .filter((item): item is OfficialChatTopicView => Boolean(item))
  const expectedCount = Math.min(RANDOM_TOPIC_COUNT, items.length)
  return preferred.length === expectedCount ? preferred : randomTopics(items)
}

Page({
  data: {
    activeTab: "official" as "official" | "mine",
    officialItems: [] as OfficialChatTopicView[],
    myItems: [] as UserChatTopic[],
    randomItems: [] as OfficialChatTopicView[],
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    canWrite: false,
    addingOfficialId: "",
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
    const preferredIds = this.data.randomItems.map((item) => item.id)
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading
    })
    try {
      const session = await ensureLogin()
      const { officialItems, myItems } = await listChatTopics()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const officialViews = withAddedState(officialItems, myItems)
      this.setData({
        officialItems: officialViews,
        myItems,
        randomItems: retainOrPickRandomTopics(officialViews, preferredIds),
        canWrite: session.user.can_write
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
    const tab = event.currentTarget.dataset.tab as "official" | "mine"
    if (!tab || tab === this.data.activeTab) return
    this.setData({ activeTab: tab })
  },

  handleRandom() {
    if (this.data.contentLoading || this.data.officialItems.length === 0) return
    const previousIds = this.data.randomItems.map((item) => item.id)
    this.setData({ randomItems: randomTopics(this.data.officialItems, previousIds) })
  },

  async handleAddOfficial(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.addingOfficialId || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const topic = this.data.officialItems.find((item) => item.id === id)
    if (!topic) return
    if (topic.is_added) {
      wx.showToast({ title: "已在我的话题中", icon: "none" })
      return
    }
    this.setData({ addingOfficialId: id })
    try {
      const result = await addOfficialChatTopic(id)
      if (!isAsyncPageActive(this)) return
      const myItems = this.data.myItems.some((item) => item.id === result.item.id)
        ? this.data.myItems
        : [result.item, ...this.data.myItems]
      const officialItems = withAddedState(this.data.officialItems, myItems)
      const randomIds = this.data.randomItems.map((item) => item.id)
      this.setData({
        myItems,
        officialItems,
        randomItems: retainOrPickRandomTopics(officialItems, randomIds)
      })
      wx.showToast({ title: result.created ? "已加入" : "已经加入过了", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "加入失败",
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
      this.setData({ showEditor: false, myItems })
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
      const randomIds = this.data.randomItems.map((item) => item.id)
      this.setData({
        showDeleteConfirm: false,
        deletingId: "",
        myItems,
        officialItems,
        randomItems: retainOrPickRandomTopics(officialItems, randomIds)
      })
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

import { ensureLogin } from "../../services/auth"
import {
  createLuggageGroup,
  createLuggageItem,
  createLuggageScene,
  deleteLuggageGroup,
  deleteLuggageItem,
  deleteLuggageScene,
  listLuggageScenes,
  moveLuggageItem,
  moveLuggageGroup,
  updateLuggageGroup,
  updateLuggageItem,
  updateLuggageScene
} from "../../services/life-lists"
import type { LuggageScene } from "../../types/life-lists"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  invalidateAsyncPageRequests,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"
import { findClosestSortTarget } from "../../utils/drag-sort"
import type { SortableRect } from "../../utils/drag-sort"

let dragSourceId = ""
let dragSourceGroupId = ""
let dragTargetItemId = ""
let dragItems: Array<SortableRect & { id: string; groupId: string }> = []
let dragGroupRects: Array<SortableRect & { id: string }> = []
let dragTargetGroupId = ""
let dragInsertAfter = false
let suppressItemTapUntil = 0
let groupDragSourceIndex = -1
let groupDragTargetIndex = -1
let groupDragIds: string[] = []
let groupDragRects: SortableRect[] = []
let groupDragInsertAfter = false

function resetDragSession(): void {
  dragSourceId = ""
  dragSourceGroupId = ""
  dragTargetItemId = ""
  dragItems = []
  dragGroupRects = []
  dragTargetGroupId = ""
  dragInsertAfter = false
}

function resetGroupDragSession(): void {
  groupDragSourceIndex = -1
  groupDragTargetIndex = -1
  groupDragIds = []
  groupDragRects = []
  groupDragInsertAfter = false
}

function getTouchPoint(event: WechatMiniprogram.TouchEvent) {
  return event.touches[0] || event.changedTouches[0] || null
}

function promptText(title: string, placeholder: string, content = ""): Promise<string | null> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      editable: true,
      placeholderText: placeholder,
      content,
      success: (result) => resolve(result.confirm ? result.content.trim() || null : null),
      fail: () => resolve(null)
    })
  })
}

function getSceneCounts(scene: LuggageScene | null): {
  groupCount: number
  itemCount: number
} {
  if (!scene) return { groupCount: 0, itemCount: 0 }
  return {
    groupCount: scene.groups.length,
    itemCount: scene.groups.reduce((total, group) => total + group.items.length, 0)
  }
}

Page({
  data: {
    scenes: [] as LuggageScene[],
    activeSceneId: "",
    activeScene: null as LuggageScene | null,
    activeGroupCount: 0,
    activeItemCount: 0,
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    sorting: false,
    groupSorting: false,
    draggingGroupIndex: -1,
    dragTargetGroupIndex: -1,
    dragInsertAfter: false,
    groupDragInsertAfter: false,
    draggingItemId: "",
    dragTargetItemId: "",
    dragTargetGroupId: "",
    dragGhostVisible: false,
    dragGhostLabel: "",
    dragGhostType: "item" as "item" | "group",
    dragGhostX: 0,
    dragGhostY: 0
  },

  onShow() {
    activateAsyncPage(this)
    this.loadScenes()
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
    resetGroupDragSession()
  },

  async loadScenes() {
    if (!isAsyncPageActive(this)) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading
    })
    try {
      const session = await ensureLogin()
      const scenes = await listLuggageScenes()
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const activeSceneId = scenes.some((scene) => scene.id === this.data.activeSceneId)
        ? this.data.activeSceneId
        : scenes[0]?.id || ""
      const activeScene = scenes.find((scene) => scene.id === activeSceneId) || null
      const counts = getSceneCounts(activeScene)
      this.setData({
        scenes,
        activeSceneId,
        activeScene,
        activeGroupCount: counts.groupCount,
        activeItemCount: counts.itemCount,
        canWrite: session.user.can_write
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      wx.showToast({ title: error instanceof Error ? error.message : "加载失败", icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleSceneTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sorting || this.data.groupSorting) return
    const id = String(event.currentTarget.dataset.id || "")
    const activeScene = this.data.scenes.find((scene) => scene.id === id) || null
    const counts = getSceneCounts(activeScene)
    this.setData({
      activeSceneId: id,
      activeScene,
      activeGroupCount: counts.groupCount,
      activeItemCount: counts.itemCount
    })
  },

  async handleAddScene() {
    if (!this.data.canWrite) return
    const name = await promptText("新增场景", "例如：成都三日游")
    if (!name || !isAsyncPageActive(this)) return
    try {
      const scene = await createLuggageScene(name)
      if (!isAsyncPageActive(this)) return
      this.setData({ activeSceneId: scene.id })
      await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "新增失败", icon: "none" })
      }
    }
  },

  async handleRenameScene() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite) return
    const name = await promptText("修改场景名", "输入场景名称", scene.name)
    if (!name || !isAsyncPageActive(this)) return
    await updateLuggageScene(scene.id, name)
    if (isAsyncPageActive(this)) this.loadScenes()
  },

  handleDeleteScene() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite) return
    wx.showModal({
      title: "删除场景",
      content: `将同时删除“${scene.name}”下的全部层级和物品。`,
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        await deleteLuggageScene(scene.id)
        if (!isAsyncPageActive(this)) return
        this.setData({ activeSceneId: "" })
        this.loadScenes()
      }
    })
  },

  async handleAddGroup() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite) return
    const name = await promptText("新增携带层级", "例如：更加精致")
    if (!name || !isAsyncPageActive(this)) return
    await createLuggageGroup(scene.id, name)
    if (isAsyncPageActive(this)) this.loadScenes()
  },

  handleGroupDragStart(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sorting || this.data.groupSorting || this.data.contentLoading) return
    const index = Number(event.currentTarget.dataset.index)
    const groups = this.data.activeScene?.groups || []
    if (!Number.isInteger(index) || index < 0 || index >= groups.length) return
    groupDragSourceIndex = index
    groupDragTargetIndex = index
    groupDragIds = groups.map((group) => group.id)
    const touch = getTouchPoint(event)
    invalidateAsyncPageRequests(this)
    this.setData({
      groupSorting: true,
      draggingGroupIndex: index,
      dragTargetGroupIndex: index,
      dragGhostVisible: true,
      dragGhostLabel: groups[index].name,
      dragGhostType: "group",
      dragGhostX: touch?.clientX || 0,
      dragGhostY: touch?.clientY || 0
    })
    wx.createSelectorQuery()
      .selectAll(".js-sortable-group")
      .boundingClientRect((result) => {
        groupDragRects = result as unknown as SortableRect[]
      })
      .exec()
  },

  handleGroupDragMove(event: WechatMiniprogram.TouchEvent) {
    if (groupDragSourceIndex < 0 || groupDragRects.length === 0) return
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) return
    this.setData({ dragGhostX: touch.clientX, dragGhostY: touch.clientY })
    const target = findClosestSortTarget(groupDragRects, touch.clientX, touch.clientY)
    if (target < 0) return
    const insertAfter = touch.clientY > (groupDragRects[target].top + groupDragRects[target].bottom) / 2
    if (target === groupDragTargetIndex && insertAfter === groupDragInsertAfter) return
    groupDragTargetIndex = target
    groupDragInsertAfter = insertAfter
    this.setData({ dragTargetGroupIndex: target, groupDragInsertAfter: insertAfter })
  },

  handleGroupDragCancel() {
    resetGroupDragSession()
    this.setData({ groupSorting: false, draggingGroupIndex: -1, dragTargetGroupIndex: -1, groupDragInsertAfter: false, dragGhostVisible: false })
  },

  async handleGroupDragEnd() {
    const sourceId = groupDragIds[groupDragSourceIndex] || ""
    const targetId = groupDragIds[groupDragTargetIndex] || ""
    const insertAfter = groupDragInsertAfter
    resetGroupDragSession()
    this.setData({ draggingGroupIndex: -1, dragTargetGroupIndex: -1, dragGhostVisible: false })
    if (!sourceId || !targetId || sourceId === targetId) {
      this.setData({ groupSorting: false })
      return
    }
    try {
      await moveLuggageGroup(sourceId, targetId, insertAfter)
      if (isAsyncPageActive(this)) await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "排序失败", icon: "none" })
        await this.loadScenes()
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ groupSorting: false })
    }
  },

  async handleRenameGroup(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    const nextName = await promptText("修改层级名", "输入层级名称", name)
    if (!nextName || !isAsyncPageActive(this)) return
    await updateLuggageGroup(id, nextName)
    if (isAsyncPageActive(this)) this.loadScenes()
  },

  handleDeleteGroup(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    wx.showModal({
      title: "删除携带层级",
      content: "该层级下的物品也会删除。",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        await deleteLuggageGroup(id)
        if (isAsyncPageActive(this)) this.loadScenes()
      }
    })
  },

  async handleAddItem(event: WechatMiniprogram.TouchEvent) {
    const groupId = String(event.currentTarget.dataset.groupId || "")
    const name = await promptText("新增物品", "例如：身份证")
    if (!name || !isAsyncPageActive(this)) return
    await createLuggageItem(groupId, name)
    if (isAsyncPageActive(this)) this.loadScenes()
  },

  async handleRenameItem(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    const nextName = await promptText("修改物品", "输入物品名称", name)
    if (!nextName || !isAsyncPageActive(this)) return
    await updateLuggageItem(id, nextName)
    if (isAsyncPageActive(this)) this.loadScenes()
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sorting || Date.now() < suppressItemTapUntil) return
    this.handleRenameItem(event)
  },

  handleDragStart(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sorting || this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const groupId = String(event.currentTarget.dataset.groupId || "")
    if (!id || !groupId) return

    dragSourceId = id
    dragSourceGroupId = groupId
    dragTargetItemId = id
    dragTargetGroupId = groupId
    suppressItemTapUntil = Date.now() + 1000
    const item = this.data.activeScene?.groups
      .find((group) => group.id === groupId)?.items.find((entry) => entry.id === id)
    const touch = getTouchPoint(event)
    invalidateAsyncPageRequests(this)
    this.setData({
      sorting: true,
      draggingItemId: id,
      dragTargetItemId: id,
      dragTargetGroupId,
      dragGhostVisible: true,
      dragGhostLabel: item?.name || "物品",
      dragGhostType: "item",
      dragGhostX: touch?.clientX || 0,
      dragGhostY: touch?.clientY || 0
    })

    wx.createSelectorQuery()
      .selectAll(".js-luggage-item")
      .fields({ rect: true, dataset: true }, (itemResult) => {
        dragItems = (itemResult as unknown as Array<SortableRect & { dataset: { id: string; groupId: string } }>).map((rect) => ({
          ...rect,
          id: String(rect.dataset.id || ""),
          groupId: String(rect.dataset.groupId || "")
        }))
      })
      .selectAll(".js-group-card")
      .fields({ rect: true, dataset: true }, (groupResult) => {
        dragGroupRects = (groupResult as unknown as Array<SortableRect & { dataset: { groupId: string } }>).map((rect) => ({
          ...rect,
          id: String(rect.dataset.groupId || "")
        }))
      })
      .exec()
  },

  handleDragMove(event: WechatMiniprogram.TouchEvent) {
    if (!dragSourceId) return
    const touch = event.touches[0] || event.changedTouches[0]
    if (!touch) return
    this.setData({ dragGhostX: touch.clientX, dragGhostY: touch.clientY })
    const hoveredGroup = dragGroupRects.find((rect) =>
      touch.clientX >= rect.left && touch.clientX <= rect.right &&
      touch.clientY >= rect.top && touch.clientY <= rect.bottom
    )
    const nextGroupId = hoveredGroup?.id || dragTargetGroupId || dragSourceGroupId
    const groupItems = dragItems.filter((item) => item.groupId === nextGroupId)
    const nextIndex = findClosestSortTarget(groupItems, touch.clientX, touch.clientY)
    const nextItemId = nextIndex >= 0 ? groupItems[nextIndex]?.id || "" : ""
    const insertAfter = nextIndex >= 0
      ? touch.clientY > (groupItems[nextIndex].top + groupItems[nextIndex].bottom) / 2
      : false
    if (nextGroupId === dragTargetGroupId && nextItemId === dragTargetItemId && insertAfter === dragInsertAfter) return
    dragTargetGroupId = nextGroupId
    dragTargetItemId = nextItemId
    dragInsertAfter = insertAfter
    this.setData({ dragTargetGroupId: nextGroupId, dragTargetItemId: nextItemId, dragInsertAfter: insertAfter })
  },

  handleDragCancel() {
    resetDragSession()
    this.setData({ sorting: false, draggingItemId: "", dragTargetItemId: "", dragTargetGroupId: "", dragGhostVisible: false })
  },

  async handleDragEnd() {
    const sourceId = dragSourceId
    const sourceGroupId = dragSourceGroupId
    const targetGroupId = dragTargetGroupId
    const targetItemId = dragTargetItemId
    const insertAfter = dragInsertAfter
    const unchanged = targetGroupId === sourceGroupId && sourceId === targetItemId
    resetDragSession()
    this.setData({ draggingItemId: "", dragTargetItemId: "", dragTargetGroupId: "", dragGhostVisible: false })
    if (!sourceId || !targetGroupId || unchanged) {
      this.setData({ sorting: false })
      return
    }
    try {
      await moveLuggageItem(sourceId, targetGroupId, targetItemId, insertAfter)
      if (!isAsyncPageActive(this)) return
      await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "移动失败", icon: "none" })
        await this.loadScenes()
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ sorting: false })
    }
  },

  handleDeleteItem(event: WechatMiniprogram.TouchEvent) {
    const id = String(event.currentTarget.dataset.id || "")
    wx.showModal({
      title: "删除物品",
      content: "确认删除这件物品？",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        await deleteLuggageItem(id)
        if (isAsyncPageActive(this)) this.loadScenes()
      }
    })
  }
})

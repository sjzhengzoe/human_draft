import { ensureLogin } from "../../services/auth"
import {
  createLuggageGroup,
  createLuggageItem,
  deleteLuggageGroup,
  deleteLuggageItem,
  deleteLuggageScene,
  listLuggageScenes,
  moveLuggageItem,
  moveLuggageGroup,
  updateLuggageGroup,
  updateLuggageItem
} from "../../services/luggage"
import type { LuggageItem, LuggageScene } from "../../types/luggage"
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

type LuggageOrderSnapshot = {
  groupIds: string[]
  itemIdsByGroup: Record<string, string[]>
}

let luggageSortOriginalOrder: LuggageOrderSnapshot | null = null

function captureLuggageOrder(scene: LuggageScene): LuggageOrderSnapshot {
  return {
    groupIds: scene.groups.map((group) => group.id),
    itemIdsByGroup: Object.fromEntries(
      scene.groups.map((group) => [
        group.id,
        group.items.map((item) => item.id)
      ])
    )
  }
}

function cloneLuggageOrder(order: LuggageOrderSnapshot): LuggageOrderSnapshot {
  return {
    groupIds: [...order.groupIds],
    itemIdsByGroup: Object.fromEntries(
      Object.entries(order.itemIdsByGroup).map(([groupId, itemIds]) => [
        groupId,
        [...itemIds]
      ])
    )
  }
}

function hasSameLuggageOrder(
  left: LuggageOrderSnapshot,
  right: LuggageOrderSnapshot
): boolean {
  if (
    left.groupIds.length !== right.groupIds.length ||
    !left.groupIds.every((id, index) => id === right.groupIds[index])
  ) return false
  return right.groupIds.every((groupId) => {
    const leftItems = left.itemIdsByGroup[groupId] || []
    const rightItems = right.itemIdsByGroup[groupId] || []
    return (
      leftItems.length === rightItems.length &&
      leftItems.every((id, index) => id === rightItems[index])
    )
  })
}

function cloneLuggageScene(scene: LuggageScene): LuggageScene {
  return {
    ...scene,
    groups: scene.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item }))
    }))
  }
}

function replaceScene(scenes: LuggageScene[], nextScene: LuggageScene): LuggageScene[] {
  return scenes.map((scene) => scene.id === nextScene.id ? nextScene : scene)
}

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
    ordering: false,
    savingItem: false,
    savingGroup: false,
    savingScene: false,
    editing: false,
    editingLabel: "",
    deleting: false,
    deletingLabel: "",
    sortEditing: false,
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
    luggageSortOriginalOrder = null
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.loadScenes()
  },

  onUnload() {
    deactivateAsyncPage(this)
    resetDragSession()
    resetGroupDragSession()
    luggageSortOriginalOrder = null
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
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    const activeScene = this.data.scenes.find((scene) => scene.id === id) || null
    const counts = getSceneCounts(activeScene)
    this.setData({
      activeSceneId: id,
      activeScene,
      sortEditing: false,
      activeGroupCount: counts.groupCount,
      activeItemCount: counts.itemCount
    })
  },

  async handleSortEditingToggle() {
    if (!this.data.canWrite || this.data.ordering) return
    const scene = this.data.activeScene
    if (!scene) return
    if (!this.data.sortEditing) {
      luggageSortOriginalOrder = captureLuggageOrder(scene)
      this.setData({ sortEditing: true })
      return
    }

    const desiredOrder = captureLuggageOrder(scene)
    if (
      !luggageSortOriginalOrder ||
      hasSameLuggageOrder(luggageSortOriginalOrder, desiredOrder)
    ) {
      luggageSortOriginalOrder = null
      this.setData({ sortEditing: false })
      return
    }

    const workingOrder = cloneLuggageOrder(luggageSortOriginalOrder)
    this.setData({ ordering: true })
    try {
      for (let index = 0; index < desiredOrder.groupIds.length; index += 1) {
        const desiredGroupId = desiredOrder.groupIds[index]
        if (workingOrder.groupIds[index] === desiredGroupId) continue
        const currentIndex = workingOrder.groupIds.indexOf(desiredGroupId)
        const targetGroupId = workingOrder.groupIds[index]
        if (currentIndex < 0 || !targetGroupId) {
          throw new Error("行李分组排序数据已变化，请重新加载")
        }
        await moveLuggageGroup(desiredGroupId, targetGroupId, false)
        workingOrder.groupIds.splice(currentIndex, 1)
        workingOrder.groupIds.splice(index, 0, desiredGroupId)
        luggageSortOriginalOrder = cloneLuggageOrder(workingOrder)
      }

      for (const groupId of desiredOrder.groupIds) {
        const desiredItemIds = desiredOrder.itemIdsByGroup[groupId] || []
        for (let index = 0; index < desiredItemIds.length; index += 1) {
          const desiredItemId = desiredItemIds[index]
          const targetItems = workingOrder.itemIdsByGroup[groupId] || []
          if (targetItems[index] === desiredItemId) continue
          const sourceGroupId = Object.keys(workingOrder.itemIdsByGroup)
            .find((id) => workingOrder.itemIdsByGroup[id].includes(desiredItemId))
          if (!sourceGroupId) {
            throw new Error("行李物品排序数据已变化，请重新加载")
          }
          const targetItemId = targetItems[index] || ""
          await moveLuggageItem(desiredItemId, groupId, targetItemId, false)
          const sourceItems = workingOrder.itemIdsByGroup[sourceGroupId]
          sourceItems.splice(sourceItems.indexOf(desiredItemId), 1)
          const nextTargetItems = workingOrder.itemIdsByGroup[groupId] || []
          nextTargetItems.splice(index, 0, desiredItemId)
          workingOrder.itemIdsByGroup[groupId] = nextTargetItems
          luggageSortOriginalOrder = cloneLuggageOrder(workingOrder)
        }
      }

      if (!isAsyncPageActive(this)) return
      luggageSortOriginalOrder = null
      this.setData({ sortEditing: false })
      wx.showToast({ title: "排序已保存", icon: "success" })
      await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({
          title: error instanceof Error ? error.message : "排序保存失败",
          icon: "none"
        })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ ordering: false })
    }
  },

  handleAddScene() {
    if (!this.data.canWrite || this.data.savingScene) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/luggage/scenes/index" })
  },

  handleRenameScene() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite || this.data.editing) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: `/pages/luggage/scene-edit/index?id=${scene.id}` })
  },

  handleDeleteScene() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite || this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.showModal({
      title: "删除场景",
      content: `将同时删除“${scene.name}”下的全部层级和物品。`,
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ deleting: true, deletingLabel: "正在删除场景…" })
        try {
          await deleteLuggageScene(scene.id)
          if (!isAsyncPageActive(this)) return
          this.setData({ activeSceneId: "" })
          await this.loadScenes()
        } catch (error) {
          if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
        } finally {
          if (isAsyncPageActive(this)) this.setData({ deleting: false, deletingLabel: "" })
        }
      }
    })
  },

  async handleAddGroup() {
    const scene = this.data.activeScene
    if (!scene || !this.data.canWrite || this.data.savingGroup) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const name = await promptText("新增携带层级", "例如：更加精致")
    if (!name || !isAsyncPageActive(this)) return
    this.setData({ savingGroup: true })
    try {
      await createLuggageGroup(scene.id, name)
      if (isAsyncPageActive(this)) await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "新增失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ savingGroup: false })
    }
  },

  handleGroupMove(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const scene = this.data.activeScene
    const groups = scene?.groups || []
    const targetIndex = index + direction
    if (
      !scene ||
      !this.data.canWrite ||
      !this.data.sortEditing ||
      this.data.ordering ||
      targetIndex < 0 ||
      targetIndex >= groups.length
    ) return
    const nextGroups = [...groups]
    const [group] = nextGroups.splice(index, 1)
    nextGroups.splice(targetIndex, 0, group)
    const nextScene = { ...scene, groups: nextGroups }
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene)
    })
  },

  handleItemMove(event: WechatMiniprogram.TouchEvent) {
    const groupId = String(event.currentTarget.dataset.groupId || "")
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const scene = this.data.activeScene
    const items = scene?.groups.find((group) => group.id === groupId)?.items || []
    const targetIndex = index + direction
    if (
      !scene ||
      !this.data.canWrite ||
      !this.data.sortEditing ||
      this.data.ordering ||
      targetIndex < 0 ||
      targetIndex >= items.length
    ) return
    const nextScene = cloneLuggageScene(scene)
    const nextItems = nextScene.groups.find((group) => group.id === groupId)?.items
    if (!nextItems) return
    const [item] = nextItems.splice(index, 1)
    nextItems.splice(targetIndex, 0, item)
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene)
    })
  },

  handleGroupDragStart(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      !this.data.sortEditing ||
      this.data.sorting ||
      this.data.groupSorting ||
      this.data.contentLoading
    ) return
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

  handleGroupDragEnd() {
    const sourceId = groupDragIds[groupDragSourceIndex] || ""
    const targetId = groupDragIds[groupDragTargetIndex] || ""
    const insertAfter = groupDragInsertAfter
    resetGroupDragSession()
    this.setData({ draggingGroupIndex: -1, dragTargetGroupIndex: -1, dragGhostVisible: false })
    if (!sourceId || !targetId || sourceId === targetId) {
      this.setData({ groupSorting: false })
      return
    }
    const scene = this.data.activeScene
    if (!scene) {
      this.setData({ groupSorting: false })
      return
    }
    const groups = [...scene.groups]
    const sourceIndex = groups.findIndex((group) => group.id === sourceId)
    const targetIndex = groups.findIndex((group) => group.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) {
      this.setData({ groupSorting: false })
      return
    }
    const [group] = groups.splice(sourceIndex, 1)
    const nextTargetIndex = groups.findIndex((entry) => entry.id === targetId)
    groups.splice(nextTargetIndex + (insertAfter ? 1 : 0), 0, group)
    const nextScene = { ...scene, groups }
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene),
      groupSorting: false
    })
  },

  async handleRenameGroup(event: WechatMiniprogram.TouchEvent) {
    if (this.data.editing) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    const nextName = await promptText("修改层级名", "输入层级名称", name)
    if (!nextName || !isAsyncPageActive(this)) return
    this.setData({ editing: true, editingLabel: "正在修改分组…" })
    try {
      await updateLuggageGroup(id, nextName)
      if (isAsyncPageActive(this)) await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "修改失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ editing: false, editingLabel: "" })
    }
  },

  handleDeleteGroup(event: WechatMiniprogram.TouchEvent) {
    if (this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    wx.showModal({
      title: "删除携带层级",
      content: "该层级下的物品也会删除。",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ deleting: true, deletingLabel: "正在删除分组…" })
        try {
          await deleteLuggageGroup(id)
          if (isAsyncPageActive(this)) await this.loadScenes()
        } catch (error) {
          if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
        } finally {
          if (isAsyncPageActive(this)) this.setData({ deleting: false, deletingLabel: "" })
        }
      }
    })
  },

  async handleAddItem(event: WechatMiniprogram.TouchEvent) {
    const groupId = String(event.currentTarget.dataset.groupId || "")
    if (this.data.savingItem) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const name = await promptText("新增物品", "例如：身份证")
    if (!name || !isAsyncPageActive(this)) return
    this.setData({ savingItem: true })
    try {
      await createLuggageItem(groupId, name)
      if (isAsyncPageActive(this)) await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "新增失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ savingItem: false })
    }
  },

  async handleRenameItem(event: WechatMiniprogram.TouchEvent) {
    if (this.data.editing) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    const nextName = await promptText("修改物品", "输入物品名称", name)
    if (!nextName || !isAsyncPageActive(this)) return
    this.setData({ editing: true, editingLabel: "正在修改物品…" })
    try {
      await updateLuggageItem(id, nextName)
      if (isAsyncPageActive(this)) await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "修改失败", icon: "none" })
    } finally {
      if (isAsyncPageActive(this)) this.setData({ editing: false, editingLabel: "" })
    }
  },

  handleItemTap(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      this.data.sortEditing ||
      this.data.sorting ||
      Date.now() < suppressItemTapUntil
    ) return
    this.handleRenameItem(event)
  },

  handleDragStart(event: WechatMiniprogram.TouchEvent) {
    if (
      !this.data.canWrite ||
      !this.data.sortEditing ||
      this.data.sorting ||
      this.data.contentLoading
    ) return
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

  handleDragEnd() {
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
    const scene = this.data.activeScene
    if (!scene) {
      this.setData({ sorting: false })
      return
    }
    const nextScene = cloneLuggageScene(scene)
    let movedItem: LuggageItem | null = null
    for (const group of nextScene.groups) {
      const sourceIndex = group.items.findIndex((item) => item.id === sourceId)
      if (sourceIndex >= 0) {
        const removedItems = group.items.splice(sourceIndex, 1)
        movedItem = removedItems[0] || null
        break
      }
    }
    const targetGroup = nextScene.groups.find((group) => group.id === targetGroupId)
    if (!movedItem || !targetGroup) {
      this.setData({ sorting: false })
      return
    }
    const targetIndex = targetItemId
      ? targetGroup.items.findIndex((item) => item.id === targetItemId)
      : targetGroup.items.length
    const insertIndex = targetIndex < 0
      ? targetGroup.items.length
      : targetIndex + (insertAfter ? 1 : 0)
    targetGroup.items.splice(insertIndex, 0, {
      ...movedItem,
      group_id: targetGroupId
    })
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene),
      sorting: false
    })
  },

  handleDeleteItem(event: WechatMiniprogram.TouchEvent) {
    if (this.data.deleting) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    wx.showModal({
      title: "删除物品",
      content: "确认删除这件物品？",
      confirmText: "删除",
      confirmColor: "#c9342f",
      success: async (result) => {
        if (!result.confirm || !isAsyncPageActive(this)) return
        this.setData({ deleting: true, deletingLabel: "正在删除物品…" })
        try {
          await deleteLuggageItem(id)
          if (isAsyncPageActive(this)) await this.loadScenes()
        } catch (error) {
          if (isAsyncPageActive(this)) wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
        } finally {
          if (isAsyncPageActive(this)) this.setData({ deleting: false, deletingLabel: "" })
        }
      }
    })
  }
})

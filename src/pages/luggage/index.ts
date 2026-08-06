import { ensureLogin } from "../../services/auth"
import {
  createLuggageGroup,
  createLuggageItem,
  deleteLuggageGroup,
  deleteLuggageItem,
  listLuggageScenes,
  moveLuggageGroup,
  moveLuggageItem,
  updateLuggageGroup,
  updateLuggageItem
} from "../../services/luggage"
import type { LuggageScene } from "../../types/luggage"
import {
  activateAsyncPage,
  beginAsyncPageRequest,
  deactivateAsyncPage,
  isAsyncPageActive,
  isAsyncPageRequestCurrent
} from "../../utils/async-page"

type LuggageOrderSnapshot = {
  groupIds: string[]
  itemIdsByGroup: Record<string, string[]>
}

type EditorKind = "group" | "item"
type DeleteKind = "group" | "item"
type LuggageSceneView = LuggageScene & { item_count: number }

let luggageSortOriginalOrder: LuggageOrderSnapshot | null = null

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

function cloneLuggageScene(scene: LuggageSceneView): LuggageSceneView {
  return {
    ...scene,
    groups: scene.groups.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item }))
    }))
  }
}

function replaceScene(scenes: LuggageSceneView[], nextScene: LuggageSceneView): LuggageSceneView[] {
  return scenes.map((scene) => scene.id === nextScene.id ? nextScene : scene)
}

function captureLuggageOrder(scene: LuggageScene): LuggageOrderSnapshot {
  return {
    groupIds: scene.groups.map((group) => group.id),
    itemIdsByGroup: Object.fromEntries(
      scene.groups.map((group) => [group.id, group.items.map((item) => item.id)])
    )
  }
}

function cloneLuggageOrder(order: LuggageOrderSnapshot): LuggageOrderSnapshot {
  return {
    groupIds: [...order.groupIds],
    itemIdsByGroup: Object.fromEntries(
      Object.entries(order.itemIdsByGroup).map(([groupId, itemIds]) => [groupId, [...itemIds]])
    )
  }
}

function hasSameLuggageOrder(left: LuggageOrderSnapshot, right: LuggageOrderSnapshot): boolean {
  if (
    left.groupIds.length !== right.groupIds.length ||
    !left.groupIds.every((id, index) => id === right.groupIds[index])
  ) return false

  return right.groupIds.every((groupId) => {
    const leftItems = left.itemIdsByGroup[groupId] || []
    const rightItems = right.itemIdsByGroup[groupId] || []
    return leftItems.length === rightItems.length &&
      leftItems.every((id, index) => id === rightItems[index])
  })
}

Page({
  data: {
    scenes: [] as LuggageSceneView[],
    viewMode: "overview" as "overview" | "detail",
    activeSceneId: "",
    activeScene: null as LuggageSceneView | null,
    activeGroupCount: 0,
    activeItemCount: 0,
    canWrite: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    errorMessage: "",
    ordering: false,
    saving: false,
    deleting: false,
    sortEditing: false,
    editorVisible: false,
    editorKind: "group" as EditorKind,
    editorId: "",
    editorParentId: "",
    editorName: "",
    editorTitle: "",
    editorPlaceholder: "",
    editorMaxlength: 80,
    editorRequired: false,
    confirmVisible: false,
    confirmKind: "group" as DeleteKind,
    confirmId: "",
    confirmTitle: "",
    confirmContent: ""
  },

  onShow() {
    activateAsyncPage(this)
    luggageSortOriginalOrder = null
    if (this.data.sortEditing) this.setData({ sortEditing: false })
    this.loadScenes()
  },

  onUnload() {
    deactivateAsyncPage(this)
    luggageSortOriginalOrder = null
  },

  async loadScenes() {
    if (!isAsyncPageActive(this)) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading,
      errorMessage: ""
    })

    try {
      const session = await ensureLogin()
      const scenes = (await listLuggageScenes()).map((scene) => ({
        ...scene,
        item_count: getSceneCounts(scene).itemCount
      }))
      if (!isAsyncPageRequestCurrent(this, generation)) return

      const activeScene = scenes.find((scene) => scene.id === this.data.activeSceneId) || null
      const counts = getSceneCounts(activeScene)
      this.setData({
        scenes,
        activeSceneId: activeScene?.id || "",
        activeScene,
        activeGroupCount: counts.groupCount,
        activeItemCount: counts.itemCount,
        viewMode: this.data.viewMode === "detail" && activeScene ? "detail" : "overview",
        canWrite: session.user.can_write
      })
    } catch (error) {
      if (!isAsyncPageRequestCurrent(this, generation)) return
      const errorMessage = error instanceof Error ? error.message : "加载失败"
      this.setData({ errorMessage })
      wx.showToast({ title: errorMessage, icon: "none" })
    } finally {
      if (isAsyncPageRequestCurrent(this, generation)) {
        this.setData({ loading: false, contentLoading: false, hasLoaded: true })
      }
    }
  },

  handleSceneTap(event: WechatMiniprogram.TouchEvent) {
    if (this.data.contentLoading) return
    const id = String(event.currentTarget.dataset.id || "")
    const activeScene = this.data.scenes.find((scene) => scene.id === id) || null
    if (!activeScene) return
    const counts = getSceneCounts(activeScene)
    this.setData({
      viewMode: "detail",
      activeSceneId: activeScene.id,
      activeScene,
      activeGroupCount: counts.groupCount,
      activeItemCount: counts.itemCount,
      sortEditing: false
    })
  },

  handleDetailBack() {
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    this.setData({ viewMode: "overview" })
  },

  handleAddScene() {
    if (!this.data.canWrite || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/luggage/scene-edit/index" })
  },

  handleManageScenes() {
    if (!this.data.canWrite || this.data.contentLoading) return
    wx.navigateTo({ url: "/pages/luggage/scenes/index" })
  },

  openGroupEditor(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sortEditing || this.data.saving || this.data.deleting) return
    const id = String(event.currentTarget.dataset.id || "")
    const name = String(event.currentTarget.dataset.name || "")
    const required = event.currentTarget.dataset.required === true ||
      String(event.currentTarget.dataset.required || "") === "true"
    this.setData({
      editorVisible: true,
      editorKind: "group",
      editorId: id,
      editorParentId: this.data.activeSceneId,
      editorName: name,
      editorTitle: "编辑携带层级",
      editorPlaceholder: "输入层级名称",
      editorMaxlength: 80,
      editorRequired: required
    })
  },

  handleAddGroup() {
    if (!this.data.canWrite || !this.data.activeScene || this.data.sortEditing || this.data.saving) return
    this.setData({
      editorVisible: true,
      editorKind: "group",
      editorId: "",
      editorParentId: this.data.activeScene.id,
      editorName: "",
      editorTitle: "新增携带层级",
      editorPlaceholder: "例如：更加舒适",
      editorMaxlength: 80,
      editorRequired: false
    })
  },

  openItemEditor(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sortEditing || this.data.saving || this.data.deleting) return
    this.setData({
      editorVisible: true,
      editorKind: "item",
      editorId: String(event.currentTarget.dataset.id || ""),
      editorParentId: String(event.currentTarget.dataset.groupId || ""),
      editorName: String(event.currentTarget.dataset.name || ""),
      editorTitle: "编辑物品",
      editorPlaceholder: "输入物品名称",
      editorMaxlength: 120,
      editorRequired: false
    })
  },

  handleAddItem(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sortEditing || this.data.saving) return
    const groupId = String(event.currentTarget.dataset.groupId || "")
    const groupName = String(event.currentTarget.dataset.groupName || "")
    if (!groupId) return
    this.setData({
      editorVisible: true,
      editorKind: "item",
      editorId: "",
      editorParentId: groupId,
      editorName: "",
      editorTitle: groupName ? `向“${groupName}”添加物品` : "新增物品",
      editorPlaceholder: "例如：身份证",
      editorMaxlength: 120,
      editorRequired: false
    })
  },

  handleEditorNameInput(event: WechatMiniprogram.Input) {
    this.setData({ editorName: event.detail.value })
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ editorVisible: false })
  },

  async saveEditor() {
    const name = this.data.editorName.trim()
    if (!name || this.data.saving || !this.data.editorParentId) return
    this.setData({ saving: true })
    try {
      if (this.data.editorKind === "group") {
        if (this.data.editorId) await updateLuggageGroup(this.data.editorId, name)
        else await createLuggageGroup(this.data.editorParentId, name)
      } else if (this.data.editorId) {
        await updateLuggageItem(this.data.editorId, name)
      } else {
        await createLuggageItem(this.data.editorParentId, name)
      }
      if (!isAsyncPageActive(this)) return
      this.setData({ editorVisible: false })
      await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "保存失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ saving: false })
    }
  },

  handleEditorDelete() {
    if (!this.data.editorId || this.data.saving || this.data.editorRequired) return
    const isGroup = this.data.editorKind === "group"
    this.setData({
      editorVisible: false,
      confirmVisible: true,
      confirmKind: this.data.editorKind,
      confirmId: this.data.editorId,
      confirmTitle: isGroup ? "删除携带层级" : "删除物品",
      confirmContent: isGroup
        ? `“${this.data.editorName}”下的全部物品也会删除。`
        : `确认删除“${this.data.editorName}”？`
    })
  },

  closeDeleteConfirm() {
    if (!this.data.deleting) this.setData({ confirmVisible: false })
  },

  async confirmDelete() {
    if (!this.data.confirmId || this.data.deleting) return
    this.setData({ deleting: true })
    try {
      if (this.data.confirmKind === "group") await deleteLuggageGroup(this.data.confirmId)
      else await deleteLuggageItem(this.data.confirmId)
      if (!isAsyncPageActive(this)) return
      this.setData({ confirmVisible: false })
      await this.loadScenes()
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "删除失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ deleting: false })
    }
  },

  handleGroupMove(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const direction = Number(event.currentTarget.dataset.direction)
    const scene = this.data.activeScene
    const groups = scene?.groups || []
    const targetIndex = index + direction
    if (
      !scene || !this.data.canWrite || !this.data.sortEditing || this.data.ordering ||
      targetIndex < 0 || targetIndex >= groups.length
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
      !scene || !this.data.canWrite || !this.data.sortEditing || this.data.ordering ||
      targetIndex < 0 || targetIndex >= items.length
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

  async handleSortEditingToggle() {
    if (!this.data.canWrite || this.data.ordering || !this.data.activeScene) return
    if (!this.data.sortEditing) {
      luggageSortOriginalOrder = captureLuggageOrder(this.data.activeScene)
      this.setData({ sortEditing: true })
      return
    }

    const desiredOrder = captureLuggageOrder(this.data.activeScene)
    if (!luggageSortOriginalOrder || hasSameLuggageOrder(luggageSortOriginalOrder, desiredOrder)) {
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
        if (currentIndex < 0 || !targetGroupId) throw new Error("行李层级排序数据已变化，请重新加载")
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
          if (!sourceGroupId) throw new Error("行李物品排序数据已变化，请重新加载")
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
  }
})

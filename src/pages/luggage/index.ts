import { ensureLogin, getCurrentUser } from "../../services/auth"
import {
  createLuggageScene,
  createLuggageGroup,
  createLuggageItem,
  deleteLuggageGroup,
  deleteLuggageItem,
  listLuggageScenes,
  reorderLuggageScene,
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
import {
  clearLuggagePackedItemIds,
  readLuggagePackedItemIds,
  saveLuggagePackedItemIds
} from "../../utils/luggage-packing"
import {
  getLuggageDataRevision,
  hasCachedLuggageScenes
} from "../../utils/luggage-data-cache"
import { requireLoginForAction } from "../../utils/login-required"

type LuggageOrderSnapshot = {
  groupIds: string[]
  itemIdsByGroup: Record<string, string[]>
}

type EditorKind = "group" | "item"
type DeleteKind = "group" | "item"
type PackingView = "unpacked" | "packed"
type LuggageSceneView = LuggageScene & { item_count: number }
type LuggageSceneTab = Pick<LuggageSceneView, "id" | "name">
type LuggagePackingItemView = LuggageScene["groups"][number]["items"][number] & {
  is_packed: boolean
}
type LuggagePackingGroupView = LuggageScene["groups"][number] & {
  visible_items: LuggagePackingItemView[]
  packing_count_label: string
  packing_empty_text: string
}

const COLLAPSED_SCENE_TAB_LIMIT = 6

let luggageSortOriginalOrder: LuggageOrderSnapshot | null = null
let luggagePackingUid = ""
let luggagePackedItemIds = new Set<string>()

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

function visibleSceneTabs(
  scenes: LuggageSceneView[],
  expanded: boolean,
  activeSceneId: string
): LuggageSceneTab[] {
  let visibleScenes: LuggageSceneView[]
  if (expanded || scenes.length <= COLLAPSED_SCENE_TAB_LIMIT) visibleScenes = scenes
  else {
    const firstScenes = scenes.slice(0, COLLAPSED_SCENE_TAB_LIMIT)
    if (!activeSceneId || firstScenes.some((scene) => scene.id === activeSceneId)) {
      visibleScenes = firstScenes
    } else {
      const activeScene = scenes.find((scene) => scene.id === activeSceneId)
      visibleScenes = activeScene
        ? [...firstScenes.slice(0, COLLAPSED_SCENE_TAB_LIMIT - 1), activeScene]
        : firstScenes
    }
  }
  return visibleScenes.map(({ id, name }) => ({ id, name }))
}

function captureLuggageOrder(scene: LuggageScene): LuggageOrderSnapshot {
  return {
    groupIds: scene.groups.map((group) => group.id),
    itemIdsByGroup: Object.fromEntries(
      scene.groups.map((group) => [group.id, group.items.map((item) => item.id)])
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

function validPackedItemIds(scene: LuggageScene | null, packedItemIds: Set<string>): Set<string> {
  if (!scene) return new Set()
  const validItemIds = new Set(scene.groups.flatMap((group) => group.items.map((item) => item.id)))
  return new Set([...packedItemIds].filter((id) => validItemIds.has(id)))
}

function buildPackingPresentation(
  scene: LuggageScene | null,
  packedItemIds: Set<string>,
  packingView: PackingView,
  sortEditing: boolean
): {
  groups: LuggagePackingGroupView[]
  packedCount: number
  unpackedCount: number
  packingPercent: number
} {
  if (!scene) {
    return { groups: [], packedCount: 0, unpackedCount: 0, packingPercent: 0 }
  }

  const totalCount = scene.groups.reduce((total, group) => total + group.items.length, 0)
  const packedCount = scene.groups.reduce(
    (total, group) => total + group.items.filter((item) => packedItemIds.has(item.id)).length,
    0
  )
  const unpackedCount = totalCount - packedCount
  const groups = scene.groups.map((group) => {
    const items = group.items.map((item) => ({
      ...item,
      is_packed: packedItemIds.has(item.id)
    }))
    const groupPackedCount = items.filter((item) => item.is_packed).length
    const groupUnpackedCount = items.length - groupPackedCount
    const visibleItems = sortEditing
      ? items
      : items.filter((item) => packingView === "packed" ? item.is_packed : !item.is_packed)

    return {
      ...group,
      visible_items: visibleItems,
      packing_count_label: sortEditing
        ? `${items.length} 件物品`
        : packingView === "packed"
          ? `已装 ${groupPackedCount} 件`
          : `未装 ${groupUnpackedCount} 件`,
      packing_empty_text: packingView === "packed" ? "这个层级还没有已装物品" : "这个层级已经全部装好"
    }
  })

  return {
    groups,
    packedCount,
    unpackedCount,
    packingPercent: totalCount ? Math.round((packedCount / totalCount) * 100) : 0
  }
}

Page({
  data: {
    scenes: [] as LuggageSceneView[],
    visibleScenes: [] as LuggageSceneTab[],
    sceneTabsExpanded: false,
    sceneTabsCollapsible: false,
    activeSceneId: "",
    activeScene: null as LuggageSceneView | null,
    packingGroups: [] as LuggagePackingGroupView[],
    packingView: "unpacked" as PackingView,
    activeGroupCount: 0,
    activeItemCount: 0,
    activePackedCount: 0,
    activeUnpackedCount: 0,
    activePackingPercent: 0,
    canWrite: false,
    guestMode: false,
    loading: true,
    contentLoading: false,
    hasLoaded: false,
    luggageRevision: -1,
    errorMessage: "",
    ordering: false,
    saving: false,
    sceneCreating: false,
    sceneCreateVisible: false,
    deleting: false,
    sortEditing: false,
    editorVisible: false,
    editorKind: "group" as EditorKind,
    editorId: "",
    editorParentId: "",
    editorName: "",
    editorCanSave: false,
    editorTitle: "",
    editorPlaceholder: "",
    editorMaxlength: 80,
    editorRequired: false,
    confirmVisible: false,
    confirmKind: "group" as DeleteKind,
    confirmId: "",
    confirmTitle: "",
    confirmContent: "",
    resetConfirmVisible: false,
    groupPickerVisible: false
  },

  onShow() {
    activateAsyncPage(this)
    if (!getCurrentUser()) {
      this.setData({ guestMode: true, loading: false, contentLoading: false, hasLoaded: true })
      return
    }
    if (this.data.guestMode) this.setData({ guestMode: false, hasLoaded: false })
    if (!this.data.hasLoaded || this.data.luggageRevision !== getLuggageDataRevision()) {
      void this.loadScenes()
    }
  },

  onUnload() {
    deactivateAsyncPage(this)
    luggageSortOriginalOrder = null
    luggagePackingUid = ""
    luggagePackedItemIds = new Set()
  },

  async loadScenes() {
    if (!getCurrentUser()) return
    if (!isAsyncPageActive(this)) return
    const generation = beginAsyncPageRequest(this)
    const showInitialLoading = !this.data.hasLoaded
    const hasCachedScenes = hasCachedLuggageScenes()
    this.setData({
      loading: showInitialLoading,
      contentLoading: !showInitialLoading && !hasCachedScenes,
      errorMessage: ""
    })

    try {
      const session = await ensureLogin()
      const scenes = (await listLuggageScenes()).map((scene) => ({
        ...scene,
        item_count: getSceneCounts(scene).itemCount
      }))
      if (!isAsyncPageRequestCurrent(this, generation)) return

      luggagePackingUid = session.user.uid
      const activeScene = scenes.find((scene) => scene.id === this.data.activeSceneId) || scenes[0] || null
      luggagePackedItemIds = activeScene
        ? validPackedItemIds(
          activeScene,
          readLuggagePackedItemIds(luggagePackingUid, activeScene.id)
        )
        : new Set()
      if (activeScene) {
        saveLuggagePackedItemIds(luggagePackingUid, activeScene.id, luggagePackedItemIds)
      }
      const counts = getSceneCounts(activeScene)
      const packing = buildPackingPresentation(
        activeScene,
        luggagePackedItemIds,
        this.data.packingView,
        false
      )
      this.setData({
        scenes,
        visibleScenes: visibleSceneTabs(
          scenes,
          this.data.sceneTabsExpanded,
          activeScene?.id || ""
        ),
        sceneTabsCollapsible: scenes.length > COLLAPSED_SCENE_TAB_LIMIT,
        activeSceneId: activeScene?.id || "",
        activeScene,
        packingGroups: packing.groups,
        activeGroupCount: counts.groupCount,
        activeItemCount: counts.itemCount,
        activePackedCount: packing.packedCount,
        activeUnpackedCount: packing.unpackedCount,
        activePackingPercent: packing.packingPercent,
        sortEditing: false,
        canWrite: session.user.can_write,
        luggageRevision: getLuggageDataRevision()
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
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    const id = String(event.currentTarget.dataset.id || "")
    const activeScene = this.data.scenes.find((scene) => scene.id === id) || null
    if (!activeScene) return
    luggagePackedItemIds = validPackedItemIds(
      activeScene,
      readLuggagePackedItemIds(luggagePackingUid, activeScene.id)
    )
    const counts = getSceneCounts(activeScene)
    const packing = buildPackingPresentation(
      activeScene,
      luggagePackedItemIds,
      "unpacked",
      false
    )
    this.setData({
      activeSceneId: activeScene.id,
      activeScene,
      packingGroups: packing.groups,
      packingView: "unpacked",
      activeGroupCount: counts.groupCount,
      activeItemCount: counts.itemCount,
      activePackedCount: packing.packedCount,
      activeUnpackedCount: packing.unpackedCount,
      activePackingPercent: packing.packingPercent
    })
  },

  handleSceneTabsToggle() {
    const sceneTabsExpanded = !this.data.sceneTabsExpanded
    this.setData({
      sceneTabsExpanded,
      visibleScenes: visibleSceneTabs(
        this.data.scenes,
        sceneTabsExpanded,
        this.data.activeSceneId
      )
    })
  },

  handleAddScene() {
    if (!requireLoginForAction(this)) return
    if (!this.data.canWrite || this.data.contentLoading || this.data.sceneCreating) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    this.setData({ sceneCreateVisible: true })
  },

  closeSceneCreateDialog() {
    if (!this.data.sceneCreating) this.setData({ sceneCreateVisible: false })
  },

  async createScene(event: WechatMiniprogram.CustomEvent<{ name?: string }>) {
    const name = String(event.detail.name || "").trim()
    if (!name || this.data.sceneCreating) return
    this.setData({ sceneCreating: true })
    try {
      const scene = await createLuggageScene(name)
      if (!isAsyncPageActive(this)) return
      this.setData({
        sceneCreateVisible: false,
        activeSceneId: scene.id,
        packingView: "unpacked"
      })
      await this.loadScenes()
      if (isAsyncPageActive(this)) wx.showToast({ title: "场景已创建", icon: "success" })
    } catch (error) {
      if (isAsyncPageActive(this)) {
        wx.showToast({ title: error instanceof Error ? error.message : "创建失败", icon: "none" })
      }
    } finally {
      if (isAsyncPageActive(this)) this.setData({ sceneCreating: false })
    }
  },

  handleManageScenes() {
    if (!requireLoginForAction(this)) return
    if (!this.data.canWrite || this.data.contentLoading) return
    if (this.data.sortEditing) {
      wx.showToast({ title: "请先完成排序", icon: "none" })
      return
    }
    wx.navigateTo({ url: "/pages/luggage/scenes/index" })
  },

  applyPackingPresentation(
    scene: LuggageSceneView | null,
    packingView: PackingView,
    sortEditing: boolean
  ) {
    const packing = buildPackingPresentation(
      scene,
      luggagePackedItemIds,
      packingView,
      sortEditing
    )
    this.setData({
      packingGroups: packing.groups,
      packingView,
      activePackedCount: packing.packedCount,
      activeUnpackedCount: packing.unpackedCount,
      activePackingPercent: packing.packingPercent,
      sortEditing
    })
  },

  handlePackingViewChange(event: WechatMiniprogram.TouchEvent) {
    if (this.data.sortEditing) return
    const packingView = String(event.currentTarget.dataset.view || "") as PackingView
    if (packingView !== "unpacked" && packingView !== "packed") return
    this.applyPackingPresentation(this.data.activeScene, packingView, false)
  },

  handlePackingItemToggle(event: WechatMiniprogram.TouchEvent) {
    const scene = this.data.activeScene
    const itemId = String(event.currentTarget.dataset.id || "")
    if (!scene || !itemId || this.data.sortEditing) return
    const itemExists = scene.groups.some((group) => group.items.some((item) => item.id === itemId))
    if (!itemExists) return

    const nextPackedItemIds = new Set(luggagePackedItemIds)
    if (nextPackedItemIds.has(itemId)) nextPackedItemIds.delete(itemId)
    else nextPackedItemIds.add(itemId)
    if (!saveLuggagePackedItemIds(luggagePackingUid, scene.id, nextPackedItemIds)) {
      wx.showToast({ title: "本机装箱进度保存失败", icon: "none" })
      return
    }

    luggagePackedItemIds = nextPackedItemIds
    this.applyPackingPresentation(scene, this.data.packingView, false)
  },

  openPackingResetConfirm() {
    if (!this.data.activeScene || this.data.activePackedCount === 0 || this.data.sortEditing) return
    this.setData({ resetConfirmVisible: true })
  },

  closePackingResetConfirm() {
    this.setData({ resetConfirmVisible: false })
  },

  confirmPackingReset() {
    const scene = this.data.activeScene
    if (!scene) return
    if (!clearLuggagePackedItemIds(luggagePackingUid, scene.id)) {
      wx.showToast({ title: "本机装箱进度清空失败", icon: "none" })
      return
    }
    luggagePackedItemIds = new Set()
    this.setData({ resetConfirmVisible: false })
    this.applyPackingPresentation(scene, "unpacked", false)
    wx.showToast({ title: "已重新开始", icon: "success" })
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
      editorCanSave: Boolean(name.trim()),
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
      editorCanSave: false,
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
      editorCanSave: Boolean(String(event.currentTarget.dataset.name || "").trim()),
      editorTitle: "编辑物品",
      editorPlaceholder: "输入物品名称",
      editorMaxlength: 120,
      editorRequired: false
    })
  },

  handleAddItem(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.canWrite || this.data.sortEditing || this.data.saving) return
    this.openItemCreator(
      String(event.currentTarget.dataset.groupId || ""),
      String(event.currentTarget.dataset.groupName || "")
    )
  },

  openItemCreator(groupId: string, groupName: string) {
    if (!groupId) return
    this.setData({
      groupPickerVisible: false,
      editorVisible: true,
      editorKind: "item",
      editorId: "",
      editorParentId: groupId,
      editorName: "",
      editorCanSave: false,
      editorTitle: groupName ? `向“${groupName}”添加物品` : "新增物品",
      editorPlaceholder: "例如：身份证",
      editorMaxlength: 120,
      editorRequired: false
    })
  },

  openGroupPicker() {
    const groups = this.data.activeScene?.groups || []
    if (!this.data.canWrite || this.data.sortEditing || groups.length === 0) return
    if (groups.length === 1) {
      this.openItemCreator(groups[0].id, groups[0].name)
      return
    }
    this.setData({ groupPickerVisible: true })
  },

  closeGroupPicker() {
    this.setData({ groupPickerVisible: false })
  },

  handleGroupPickerSelect(event: WechatMiniprogram.TouchEvent) {
    this.openItemCreator(
      String(event.currentTarget.dataset.groupId || ""),
      String(event.currentTarget.dataset.groupName || "")
    )
  },

  handleEmptyViewSwitch() {
    const packingView: PackingView = this.data.packingView === "unpacked" ? "packed" : "unpacked"
    this.applyPackingPresentation(this.data.activeScene, packingView, false)
  },

  handleEditorNameInput(event: WechatMiniprogram.Input) {
    const editorName = event.detail.value
    this.setData({ editorName, editorCanSave: Boolean(editorName.trim()) })
  },

  closeEditor() {
    if (!this.data.saving) this.setData({ editorVisible: false })
  },

  async saveEditor() {
    const name = this.data.editorName.trim()
    if (!name) {
      wx.showToast({ title: "请输入名称", icon: "none" })
      return
    }
    if (this.data.saving || !this.data.editorParentId) return
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
    const packing = buildPackingPresentation(
      nextScene,
      luggagePackedItemIds,
      this.data.packingView,
      true
    )
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene),
      packingGroups: packing.groups
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
    const packing = buildPackingPresentation(
      nextScene,
      luggagePackedItemIds,
      this.data.packingView,
      true
    )
    this.setData({
      activeScene: nextScene,
      scenes: replaceScene(this.data.scenes, nextScene),
      packingGroups: packing.groups
    })
  },

  async handleSortEditingToggle() {
    if (!this.data.canWrite || this.data.ordering || !this.data.activeScene) return
    if (!this.data.sortEditing) {
      luggageSortOriginalOrder = captureLuggageOrder(this.data.activeScene)
      this.applyPackingPresentation(this.data.activeScene, this.data.packingView, true)
      return
    }

    const desiredOrder = captureLuggageOrder(this.data.activeScene)
    if (!luggageSortOriginalOrder || hasSameLuggageOrder(luggageSortOriginalOrder, desiredOrder)) {
      luggageSortOriginalOrder = null
      this.applyPackingPresentation(this.data.activeScene, this.data.packingView, false)
      return
    }

    this.setData({ ordering: true })
    try {
      await reorderLuggageScene(
        this.data.activeScene.id,
        desiredOrder.groupIds,
        desiredOrder.itemIdsByGroup
      )

      if (!isAsyncPageActive(this)) return
      luggageSortOriginalOrder = null
      this.applyPackingPresentation(this.data.activeScene, this.data.packingView, false)
      this.setData({ luggageRevision: getLuggageDataRevision() })
      wx.showToast({ title: "排序已保存", icon: "success" })
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

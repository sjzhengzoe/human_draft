import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const luggagePageFiles = [
  "src/pages/luggage/index.less",
  "src/pages/luggage/scenes/index.less",
  "src/components/luggage-scene-dialog/index.less",
];

test("luggage exposes wrapped scene tabs and a reusable local packing flow", async () => {
  const [page, styles, logic, storage] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.less", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/utils/luggage-packing.ts", "utf8"),
  ]);

  assert.match(page, /class="scene-tabs"/);
  assert.match(page, /scene-tab--active/);
  assert.match(styles, /\.scene-tabs\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(styles, /\.scene-tab--active\s*\{[^}]*var\(--ui-color-action-primary\)[^}]*var\(--ui-color-text-inverse\)/s);
  assert.match(page, /packing-filter__tab/);
  assert.match(page, /group\.visible_items/);
  assert.match(page, /class="packing-checkbox/);
  assert.match(styles, /\.packing-checkbox\s*\{[^}]*border-radius:\s*8rpx/s);
  assert.match(logic, /handlePackingItemToggle/);
  assert.match(logic, /packingView === "packed"/);
  assert.match(storage, /LUGGAGE_PACKED_ITEM_IDS_V1/);
  assert.match(storage, /STORAGE_KEY_PREFIX\}:\$\{userId\}:\$\{sceneId\}/);
  assert.doesNotMatch(page, /可复用清单模板|选择场景后开始收拾|装箱状态只在本机保存/);
  assert.doesNotMatch(page, /type="search"|placeholder="搜索场景"/);
  assert.match(page, /wx:for="\{\{visibleScenes\}\}"/);
  assert.match(logic, /COLLAPSED_SCENE_TAB_LIMIT = 6/);
  assert.match(logic, /handleSceneTabsToggle/);
});

test("luggage reset stays white, is icon-only, and clears only local packing progress", async () => {
  const [page, styles, logic, icon] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.less", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/assets/icons/lucide/rotate-ccw-white.svg", "utf8"),
  ]);

  assert.match(page, /class="packing-reset[^>]*"[\s\S]*?aria-label="重新开始当前场景"[\s\S]*?<app-icon name="rotate-ccw-white"/);
  assert.match(icon, /stroke="#ffffff"/);
  assert.doesNotMatch(styles, /\.packing-reset--disabled\s*\{[^}]*opacity/s);
  assert.match(page, /title="重新开始收拾"/);
  assert.match(page, /清单内容不会改变/);
  assert.match(logic, /clearLuggagePackedItemIds\(luggagePackingUserId, scene\.id\)/);
});

test("luggage item rows edit while only the square checkbox changes packing state", async () => {
  const [page, styles] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.less", "utf8"),
  ]);

  const itemRow = page.match(/class="luggage-item"[\s\S]*?<\/view>\n            <view wx:if="\{\{group\.visible_items\.length/)?.[0] || "";
  assert.match(itemRow, /bindtap="openItemEditor"/);
  assert.match(itemRow, /class="packing-checkbox-hit"[\s\S]*?catchtap="handlePackingItemToggle"/);
  assert.match(itemRow, /aria-checked="\{\{luggageItem\.is_packed\}\}"/);
  assert.match(itemRow, /name="check-white"/);
  assert.match(itemRow, /class="luggage-item__edit-area/);
  assert.doesNotMatch(itemRow, /class="row-edit"/);
  assert.match(styles, /\.packing-checkbox-hit\s*\{[^}]*width:\s*56rpx;[^}]*height:\s*56rpx/s);
  assert.doesNotMatch(styles, /\.luggage-item:active/);
  assert.match(page, /settings-2-white/);
});

test("luggage empty states stay compact without blocking future item creation", async () => {
  const [page, logic] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
  ]);

  assert.match(page, /class="packing-view-empty"/);
  assert.match(page, /bindtap="handleEmptyViewSwitch"/);
  assert.match(page, /bindtap="openGroupPicker"/);
  assert.match(page, /title="选择携带层级"/);
  assert.match(logic, /openItemCreator/);
  assert.match(logic, /handleGroupPickerSelect/);
});

test("luggage business dialogs use the shared app dialog", async () => {
  const [page, managerPage, sceneDialog, logic, managerLogic] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/scenes/index.wxml", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/pages/luggage/scenes/index.ts", "utf8"),
  ]);

  assert.match(page, /<app-dialog/);
  assert.match(page, /<luggage-scene-dialog/);
  assert.match(managerPage, /<luggage-scene-dialog/);
  assert.match(managerPage, /title="删除场景"/);
  assert.match(sceneDialog, /<app-dialog/);
  assert.doesNotMatch(`${logic}\n${managerLogic}`, /wx\.showModal/);
});

test("both luggage scene add actions create from the shared dialog without navigation", async () => {
  const [page, managerPage, logic, managerLogic, dialog, dialogLogic] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/scenes/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/pages/luggage/scenes/index.ts", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.wxml", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.ts", "utf8"),
  ]);

  assert.match(dialogLogic, /value: "新增行李场景"/);
  assert.match(dialog, /placeholder="例如：成都三日游"/);
  assert.match(dialog, /maxlength="80"/);
  assert.match(page, /bindconfirm="createScene"/);
  assert.match(managerPage, /bindconfirm="saveScene"/);
  assert.match(logic, /const scene = await createLuggageScene\(name\)/);
  assert.match(logic, /activeSceneId: scene\.id[\s\S]*?await this\.loadScenes\(\)/);
  assert.match(managerLogic, /const scene = await createLuggageScene\(name\)/);
  assert.match(managerLogic, /scenes = \[\.\.\.scenes/);
  assert.doesNotMatch(logic, /navigateTo\(\{ url: "\/pages\/luggage\/scene-edit\/index" \}\)/);
  assert.doesNotMatch(managerLogic, /navigateTo/);
});

test("luggage scene cards edit in the shared dialog and keep deletion available", async () => {
  const [app, page, logic, dialog] = await Promise.all([
    readFile("src/app.json", "utf8"),
    readFile("src/pages/luggage/scenes/index.wxml", "utf8"),
    readFile("src/pages/luggage/scenes/index.ts", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.wxml", "utf8"),
  ]);

  assert.match(page, /data-name="\{\{item\.name\}\}"/);
  assert.match(page, /initial-name="\{\{sceneDialogName\}\}"/);
  assert.match(page, /deletable="\{\{!!sceneEditingId\}\}"/);
  assert.match(page, /binddelete="openSceneDeleteConfirm"/);
  assert.match(dialog, /删除场景/);
  assert.match(logic, /sceneDialogVisible: true,[\s\S]*?sceneEditingId: id,[\s\S]*?sceneDialogName: name/);
  assert.match(logic, /currentScene\?\.name === name/);
  assert.match(logic, /await updateLuggageScene\(editingId, name\)/);
  assert.match(logic, /await deleteLuggageScene\(id\)/);
  assert.doesNotMatch(`${app}\n${logic}`, /pages\/luggage\/scene-edit/);
});

test("luggage pages use only shared business typography sizes", async () => {
  const styles = (await Promise.all(luggagePageFiles.map((file) => readFile(file, "utf8"))))
    .join("\n");
  assert.doesNotMatch(styles, /font-size:\s*\d+rpx/);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(styles, /var\(--ui-font-size-large\)/);
});

test("luggage metadata uses readable semantic colors and valid save states", async () => {
  const [indexStyles, sceneStyles, page, dialog, logic, dialogLogic] = await Promise.all([
    readFile("src/pages/luggage/index.less", "utf8"),
    readFile("src/pages/luggage/scenes/index.less", "utf8"),
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/components/luggage-scene-dialog/index.ts", "utf8"),
  ]);

  assert.match(indexStyles, /\.group-count\s*\{[^}]*var\(--ui-color-text-muted\)/s);
  assert.match(sceneStyles, /\.scene-card__fields\s*\{[^}]*var\(--ui-color-text-muted\)/s);
  assert.match(page, /disabled="\{\{saving \|\| !editorCanSave\}\}"/);
  assert.match(dialog, /disabled="\{\{saving \|\| !canSave\}\}"/);
  assert.match(logic, /title: "请输入名称"/);
  assert.match(dialogLogic, /title: "请输入场景名称"/);
});

test("required luggage groups are protected from deletion", async () => {
  const service = await readFile("server/domains/luggage/service.mjs", "utf8");

  assert.match(service, /REQUIRED_LUGGAGE_GROUP/);
  assert.match(service, /!group\.is_required/);
  assert.match(service, /必备物品层级不能删除/);
});

test("luggage reads are deduplicated and successful mutations update shared cache", async () => {
  const [index, scenes, service, cache, auth] = await Promise.all([
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/pages/luggage/scenes/index.ts", "utf8"),
    readFile("src/services/luggage.ts", "utf8"),
    readFile("src/utils/luggage-data-cache.ts", "utf8"),
    readFile("src/services/auth.ts", "utf8"),
  ]);

  assert.match(index, /this\.data\.luggageRevision !== getLuggageDataRevision\(\)/);
  assert.match(scenes, /this\.data\.luggageRevision !== getLuggageDataRevision\(\)/);
  assert.match(service, /const cachedScenes = forceRefresh \? null : getCachedLuggageScenes\(\)/);
  assert.match(service, /if \(cachedScenes\) return cachedScenes/);
  assert.match(service, /pendingLuggageScenesRequest/);
  assert.match(service, /patchCachedScenes/);
  assert.match(service, /replaceLuggageDataCache\(scenes\)/);
  assert.match(cache, /updateLuggageDataCache/);
  assert.match(cache, /replaceLuggageDataCache/);
  assert.match(cache, /luggageDataRevision \+= 1/);
  assert.match(auth, /clearLuggageDataCache\(\)/);

  const sceneSwitch = index.match(/handleSceneTap\([\s\S]*?\n  },\n\n  handleAddScene/)?.[0] || "";
  assert.doesNotMatch(sceneSwitch, /listLuggageScenes|loadScenes/);

  const sortSave = index.match(/async handleSortEditingToggle\([\s\S]*?\n  }\n}\)/)?.[0] || "";
  assert.match(sortSave, /await reorderLuggageScene\(/);
  assert.match(sortSave, /applyPackingPresentation\(this\.data\.activeScene, this\.data\.packingView, false\)/);
  assert.doesNotMatch(sortSave, /moveLuggageGroup|moveLuggageItem/);
  assert.doesNotMatch(sortSave, /排序已保存[\s\S]*?await this\.loadScenes/);
});

test("luggage submits final sorting once and assembles list data without nested filters", async () => {
  const [client, routes, domain] = await Promise.all([
    readFile("src/services/luggage.ts", "utf8"),
    readFile("server/routes/luggage.mjs", "utf8"),
    readFile("server/domains/luggage/service.mjs", "utf8"),
  ]);

  assert.match(client, /path: "\/api\/luggage\/order"/);
  assert.match(routes, /app\.put\("\/api\/luggage\/order"/);
  assert.match(domain, /export async function reorderLuggageScene/);
  assert.match(domain, /itemsByGroupId = new Map/);
  assert.match(domain, /groupsBySceneId = new Map/);
  assert.doesNotMatch(domain, /\.select\("\*"\)[\s\S]*?读取行李物品失败/);
});

test("luggage scene manager reorders locally and saves one final snapshot on completion", async () => {
  const [page, styles, logic, client, routes, domain] = await Promise.all([
    readFile("src/pages/luggage/scenes/index.wxml", "utf8"),
    readFile("src/pages/luggage/scenes/index.less", "utf8"),
    readFile("src/pages/luggage/scenes/index.ts", "utf8"),
    readFile("src/services/luggage.ts", "utf8"),
    readFile("server/routes/luggage.mjs", "utf8"),
    readFile("server/domains/luggage/service.mjs", "utf8"),
  ]);

  assert.match(page, /aria-label="\{\{sortEditing \? '完成行李场景排序' : '调整行李场景顺序'\}\}"/);
  assert.match(page, /name="\{\{sortEditing \? 'check-white' : 'settings-2'\}\}"/);
  assert.match(page, /class="scene-card__sort"[\s\S]*?catchtap="handleSceneMove"/);
  assert.match(page, /visible="\{\{savingOrder \|\| deleting\}\}"/);
  assert.match(styles, /\.sort-control\s*\{[^}]*width:\s*56rpx;[^}]*height:\s*56rpx/s);

  const localMove = logic.match(/handleSceneMove\([\s\S]*?\n  },\n\n  async handleSortEditingToggle/)?.[0] || "";
  assert.match(localMove, /this\.setData\(\{ scenes \}\)/);
  assert.doesNotMatch(localMove, /reorderLuggageScenes|listLuggageScenes/);

  const saveOrder = logic.match(/async handleSortEditingToggle\([\s\S]*?\n  },\n\n  handleRetry/)?.[0] || "";
  assert.match(saveOrder, /hasSameOrder\(luggageSceneSortOriginalIds, desiredIds\)/);
  assert.match(saveOrder, /await reorderLuggageScenes\(desiredIds\)/);
  assert.doesNotMatch(saveOrder, /await this\.loadScenes/);
  assert.match(client, /path: "\/api\/luggage\/scenes\/order"/);
  assert.match(client, /data: \{ scene_ids: sceneIds \}/);
  assert.match(routes, /app\.put\("\/api\/luggage\/scenes\/order"/);
  assert.match(domain, /export async function reorderLuggageScenes/);
  assert.match(domain, /hasSameIds\(sceneIds, scenes\.map\(\(scene\) => scene\.id\)\)/);
});

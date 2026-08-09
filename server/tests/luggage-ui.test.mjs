import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const luggagePageFiles = [
  "src/pages/luggage/index.less",
  "src/pages/luggage/scenes/index.less",
  "src/pages/luggage/scene-edit/index.less",
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
});

test("luggage reset is icon-only and clears only local packing progress", async () => {
  const [page, logic] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
  ]);

  assert.match(page, /class="packing-reset[^>]*"[\s\S]*?aria-label="重新开始当前场景"[\s\S]*?<app-icon name="rotate-ccw"/);
  assert.match(page, /title="重新开始收拾"/);
  assert.match(page, /清单内容不会改变/);
  assert.match(logic, /clearLuggagePackedItemIds\(luggagePackingUserId, scene\.id\)/);
});

test("luggage business dialogs use the shared app dialog", async () => {
  const [page, editPage, logic, editLogic] = await Promise.all([
    readFile("src/pages/luggage/index.wxml", "utf8"),
    readFile("src/pages/luggage/scene-edit/index.wxml", "utf8"),
    readFile("src/pages/luggage/index.ts", "utf8"),
    readFile("src/pages/luggage/scene-edit/index.ts", "utf8"),
  ]);

  assert.match(page, /<app-dialog/);
  assert.match(editPage, /<app-dialog/);
  assert.doesNotMatch(`${logic}\n${editLogic}`, /wx\.showModal/);
});

test("luggage pages use only shared business typography sizes", async () => {
  const styles = (await Promise.all(luggagePageFiles.map((file) => readFile(file, "utf8"))))
    .join("\n");
  assert.doesNotMatch(styles, /font-size:\s*\d+rpx/);
  assert.match(styles, /var\(--ui-font-size-small\)/);
  assert.match(styles, /var\(--ui-font-size-base\)/);
  assert.match(styles, /var\(--ui-font-size-large\)/);
});

test("required luggage groups are protected from deletion", async () => {
  const service = await readFile("server/domains/luggage/service.mjs", "utf8");

  assert.match(service, /REQUIRED_LUGGAGE_GROUP/);
  assert.match(service, /!group\.is_required/);
  assert.match(service, /必备物品层级不能删除/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const luggagePageFiles = [
  "src/pages/luggage/index.less",
  "src/pages/luggage/scenes/index.less",
  "src/pages/luggage/scene-edit/index.less",
];

test("luggage starts with scene cards and exposes each scene's layers", async () => {
  const page = await readFile("src/pages/luggage/index.wxml", "utf8");

  assert.doesNotMatch(page, /scene-tabs|side-tabs/);
  assert.match(page, /class="scene-card"/);
  assert.match(page, /class="scene-card__layers"/);
  assert.match(page, /class="scene-layer-chip"/);
  assert.match(page, /\{\{group\.name\}\}/);
  assert.match(page, /\{\{group\.items\.length\}\}/);
  assert.doesNotMatch(page, /type="search"|placeholder="搜索场景"/);
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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home module settings uses an independent page route", async () => {
  const [appConfigSource, settingsPageSource, moduleSettingsConfigSource] =
    await Promise.all([
      readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../src/pages/settings/home-modules/index.json", import.meta.url),
        "utf8",
      ),
    ]);

  const appConfig = JSON.parse(appConfigSource);
  const moduleSettingsConfig = JSON.parse(moduleSettingsConfigSource);

  assert.ok(appConfig.pages.includes("pages/settings/home-modules/index"));
  assert.match(settingsPageSource, /wx\.navigateTo\(\{[\s\S]*?pages\/settings\/home-modules\/index/);
  assert.doesNotMatch(settingsPageSource, /showModuleSettings|setTabBarHidden/);
  assert.notEqual(moduleSettingsConfig.disableScroll, true);
});

test("account actions stay compact without exposing internal account ids", async () => {
  const [markup, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(markup, /class="settings-logout-button"[\s\S]*?>退出登录</);
  assert.doesNotMatch(markup, /class="settings-section__title">账号</);
  assert.doesNotMatch(markup, /账号 ID|accountIdText|profile-account/);
  assert.match(markup, /wx:if="\{\{isAdmin\}\}" class="profile-role">管理员</);
  assert.doesNotMatch(markup, /普通用户/);
  assert.match(styles, /\.profile-card\s*\{[\s\S]*?min-height: 152rpx/);
  assert.doesNotMatch(logic, /handleCopyOpenIdTap|setClipboardData|accountIdText/);
});

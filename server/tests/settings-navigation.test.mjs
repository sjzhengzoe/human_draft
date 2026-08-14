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

test("account section displays and copies the internal user UUID", async () => {
  const [markup, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(markup, /class="settings-logout-button"[\s\S]*?>退出登录</);
  assert.match(markup, /class="settings-section__title">账号</);
  assert.match(markup, /class="account-id-item__value"[\s\S]*?\{\{userId\}\}/);
  assert.match(markup, /aria-label="复制用户 ID"[\s\S]*?bindtap="handleCopyUserIdTap"/);
  assert.match(markup, /aria-label="修改头像和昵称"[\s\S]*?bindtap="handleEditProfileTap"/);
  assert.match(markup, /<app-dialog[\s\S]*?title="编辑个人资料"/);
  assert.match(markup, /<image-cropper[\s\S]*?shape="circle"[\s\S]*?bind:confirm="handleAvatarCropConfirm"/);
  assert.match(markup, /wx:if="\{\{isAdmin\}\}" class="profile-role">管理员</);
  assert.doesNotMatch(markup, /普通用户/);
  assert.match(styles, /\.profile-card\s*\{[\s\S]*?min-height: 152rpx/);
  assert.match(styles, /\.account-id-item__copy\s*\{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(styles, /\.profile-edit-button\s*\{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(logic, /userId: user\.id/);
  assert.match(logic, /handleCopyUserIdTap\(\)[\s\S]*?wx\.setClipboardData\(\{/);
  assert.doesNotMatch(logic, /handleCopyOpenIdTap|accountIdText/);
  assert.match(logic, /handleAvatarCropConfirm[\s\S]*?sourceFilePath[\s\S]*?pendingAvatarCrop: crop \|\| null/);
  assert.match(logic, /handleProfileSave\(\)[\s\S]*?updateAccountProfile\(displayName\)[\s\S]*?updateAccountAvatar\([\s\S]*?pendingAvatarUploadPath,[\s\S]*?pendingAvatarCrop/);
  assert.match(markup, /class="settings-section__title">存储空间</);
  assert.match(markup, /图片空间[\s\S]*?\{\{storageUsageText\}\}/);
  assert.match(markup, /公开测试期间仅展示实际用量/);
  assert.match(logic, /getImageStorageUsage\(\)/);
  assert.match(logic, /formatStorageBytes\(usage\.used_bytes\)/);
  assert.match(logic, /总额度待定/);
});

test("settings renders local account state without a fullscreen loading frame", async () => {
  const [markup, styles, logic] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(markup, /ready|fullscreen-loading|正在加载账号/);
  assert.doesNotMatch(styles, /fullscreen-loading/);
  assert.doesNotMatch(logic, /ready:/);
  assert.match(logic, /displayName: "未登录"/);
  assert.doesNotMatch(logic, /displayName: "游客"/);
  assert.match(logic, /data:\s*\{[\s\S]*?\.\.\.getSettingsAccountState\(\)/);
  assert.match(logic, /show\(\)[\s\S]*?const nextAccountState = getSettingsAccountState\(page\.failedAvatarSignature\)/);
  assert.match(logic, /nextAccountState\.avatarUrl !== this\.data\.avatarUrl/);
  assert.match(logic, /if \(accountChanged\) this\.setData\(nextAccountState\)/);
});

test("profile avatar falls back to the user initial after an image error", async () => {
  const [markup, logic] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(markup, /wx:if="\{\{avatarUrl\}\}"[\s\S]*?binderror="handleAvatarError"/);
  assert.match(markup, /wx:else class="profile-avatar-fallback">\{\{avatarInitial\}\}/);
  assert.match(logic, /handleAvatarError\(\)[\s\S]*?this\.setData\(\{ avatarUrl: "" \}\)/);
  assert.match(logic, /page\.failedAvatarSignature = `\$\{user\.id\}\|\$\{this\.data\.avatarUrl\}`/);
  assert.match(logic, /avatarSignature === failedAvatarSignature \? "" : user\.avatar_url/);
});

test("settings navigation ignores repeated taps and unlocks after failures", async () => {
  const logic = await readFile(
    new URL("../../src/pages/settings/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(logic, /show\(\)[\s\S]*?page\.navigationLocked = false/);
  assert.match(logic, /handleLoginTap\(\)[\s\S]*?if \(page\.navigationLocked\) return[\s\S]*?page\.navigationLocked = true/);
  assert.match(logic, /handleModuleSettingsTap\(\)[\s\S]*?if \(page\.navigationLocked\) return[\s\S]*?page\.navigationLocked = true/);
  assert.equal((logic.match(/fail: \(\) => \{[\s\S]*?page\.navigationLocked = false/g) || []).length, 2);
});

test("settings logout ignores duplicate taps and releases its lock on every exit path", async () => {
  const logic = await readFile(
    new URL("../../src/pages/settings/index.ts", import.meta.url),
    "utf8",
  );
  const logoutHandler = logic.match(
    /handleLogoutTap\(\) \{([\s\S]*?)\n    \},\n    handleModuleSettingsTap/,
  )?.[1] || "";

  assert.match(logoutHandler, /if \(page\.logoutPending\) return/);
  assert.match(logoutHandler, /page\.logoutPending = true/);
  assert.match(logoutHandler, /if \(!result\.confirm\) \{[\s\S]*?page\.logoutPending = false/);
  assert.match(logoutHandler, /complete: \(\) => \{[\s\S]*?page\.logoutPending = false/);
  assert.match(logoutHandler, /fail: \(\) => \{[\s\S]*?page\.logoutPending = false/);
});

test("settings content remains vertically scrollable on short screens", async () => {
  const styles = await readFile(
    new URL("../../src/pages/settings/index.less", import.meta.url),
    "utf8",
  );
  const pageBlock = styles.match(/\.page\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(pageBlock, /height: calc\(100vh - var\(--app-navigation-height\)\)/);
  assert.match(pageBlock, /overflow-y: auto/);
  assert.doesNotMatch(pageBlock, /overflow: hidden/);
});

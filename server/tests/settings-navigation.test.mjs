import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home module settings uses an independent page route", async () => {
  const [appConfigSource, settingsPageSource, settingsMarkup, moduleSettingsConfigSource,
    moduleSettingsSource, moduleSettingsMarkup, moduleSource, settingsService] =
    await Promise.all([
      readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
      readFile(
        new URL("../../src/pages/settings/home-modules/index.json", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../../src/pages/settings/home-modules/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/home-modules/index.wxml", import.meta.url), "utf8"),
      readFile(new URL("../../src/utils/home-modules.js", import.meta.url), "utf8"),
      readFile(new URL("../../src/services/home-module-settings.ts", import.meta.url), "utf8"),
    ]);

  const appConfig = JSON.parse(appConfigSource);
  const moduleSettingsConfig = JSON.parse(moduleSettingsConfigSource);

  assert.ok(appConfig.pages.includes("pages/settings/home-modules/index"));
  assert.match(settingsPageSource, /wx\.navigateTo\(\{[\s\S]*?pages\/settings\/home-modules\/index/);
  assert.doesNotMatch(
    settingsPageSource.match(/handleModuleSettingsTap\(\) \{([\s\S]*?)\n    \}/)?.[1] || "",
    /requireLoginForAction/,
  );
  assert.doesNotMatch(settingsMarkup, /login-required-dialog/);
  assert.doesNotMatch(settingsPageSource, /showModuleSettings|setTabBarHidden/);
  assert.notEqual(moduleSettingsConfig.disableScroll, true);
  assert.match(moduleSettingsSource, /handleModuleVisibleChange[\s\S]*?requireLoginForAction\(this\)/);
  assert.match(moduleSettingsSource, /loadHomeModuleSettings\(\)/);
  assert.match(moduleSettingsSource, /saveHomeModuleSettings\(\)/);
  assert.match(moduleSettingsMarkup, /title="首页设置"/);
  assert.match(moduleSettingsMarkup, /<login-required-dialog id="login-required-dialog"/);
  assert.doesNotMatch(moduleSource, /getStorageSync|setStorageSync|removeStorageSync/);
  assert.match(settingsService, /path: "\/api\/auth\/home-modules"/);
  assert.match(settingsService, /wx\.removeStorageSync\(LEGACY_STORAGE_KEY\)/);
});

test("account section displays and copies the public UID", async () => {
  const [markup, styles, logic, profileMarkup, profileLogic] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/profile-edit/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/profile-edit/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(markup, /class="settings-logout-button"[\s\S]*?bindtap="handleLogoutTap"[\s\S]*?>退出登录<\/view>/);
  assert.doesNotMatch(markup, /settings-logout-button[\s\S]*?<app-icon name="log-out"/);
  assert.match(markup, /class="settings-section__title">账号</);
  assert.match(markup, /class="account-id-item__value"[\s\S]*?\{\{uid\}\}/);
  assert.match(markup, /aria-label="复制 UID"[\s\S]*?bindtap="handleCopyUidTap"/);
  assert.match(markup, /aria-label="修改头像和昵称"[\s\S]*?bindtap="handleEditProfileTap"/);
  assert.doesNotMatch(markup, /<app-dialog|<image-cropper/);
  assert.match(logic, /pages\/settings\/profile-edit\/index/);
  assert.match(profileMarkup, /<image-cropper[\s\S]*?shape="circle"[\s\S]*?bind:confirm="handleAvatarCropConfirm"/);
  assert.match(markup, /wx:if="\{\{isAdmin\}\}" class="profile-role">管理员</);
  assert.doesNotMatch(markup, /普通用户/);
  assert.match(styles, /\.profile-card\s*\{[\s\S]*?min-height: 152rpx/);
  assert.match(styles, /\.account-id-item__copy\s*\{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(styles, /\.profile-edit-button\s*\{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(logic, /uid: user\.uid/);
  assert.match(logic, /handleCopyUidTap\(\)[\s\S]*?wx\.setClipboardData\(\{/);
  assert.doesNotMatch(logic, /handleCopyOpenIdTap|accountIdText/);
  assert.match(profileLogic, /handleAvatarCropConfirm[\s\S]*?sourceFilePath[\s\S]*?pendingAvatarCrop: crop \|\| null/);
  assert.match(profileLogic, /handleProfileSave\(\)[\s\S]*?updateAccountProfile\(displayName\)[\s\S]*?updateAccountAvatar\([\s\S]*?pendingAvatarUploadPath,[\s\S]*?pendingAvatarCrop/);
  assert.match(markup, /class="settings-section__title">存储空间</);
  assert.match(markup, /图片空间[\s\S]*?\{\{storageUsageText\}\}/);
  assert.match(markup, /达到 80 MB[\s\S]*?达到 100 MB/);
  assert.match(logic, /getImageStorageUsage\(\)/);
  assert.match(logic, /getCachedImageStorageUsage\(\)/);
  assert.match(logic, /if \(cachedUsage\) this\.setData\(getStorageUsageState\(cachedUsage\)\)/);
  assert.match(logic, /if \(this\.data\.storageUsageLoading\) return/);
  assert.match(logic, /formatStorageBytes\(usage\.used_bytes\)/);
  assert.match(logic, /formatStorageBytes\(usage\.quota_bytes\)/);
  assert.doesNotMatch(logic, /总额度待定/);
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
  assert.match(logic, /displayName: "游客"/);
  assert.doesNotMatch(logic, /displayName: "未登录"/);
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
  assert.match(logic, /page\.failedAvatarSignature = `\$\{user\.uid\}\|\$\{this\.data\.avatarUrl\}`/);
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
  assert.match(logic, /handleEditProfileTap\(\)[\s\S]*?if \(!user \|\| page\.navigationLocked\) return[\s\S]*?page\.navigationLocked = true/);
  assert.equal((logic.match(/fail: \(\) => \{[\s\S]*?page\.navigationLocked = false/g) || []).length, 4);
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

test("settings scrolls only its bounded content and disables empty bounce", async () => {
  const [markup, styles, configSource] = await Promise.all([
    readFile(new URL("../../src/pages/settings/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.json", import.meta.url), "utf8"),
  ]);
  const pageBlock = styles.match(/\.page\s*\{([\s\S]*?)\}/)?.[1] || "";

  assert.match(pageBlock, /height: calc\(100vh - var\(--app-navigation-height\)\)/);
  assert.match(markup, /<scroll-view[\s\S]*?class="page"[\s\S]*?scroll-y[\s\S]*?bounces="\{\{false\}\}"/);
  assert.equal(JSON.parse(configSource).disableScroll, true);
});

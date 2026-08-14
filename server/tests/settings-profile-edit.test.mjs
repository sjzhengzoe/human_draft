import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsRoot = new URL("../../src/pages/settings/", import.meta.url);

test("settings profile editing uses a dedicated page with the shared cropper", async () => {
  const [settingsMarkup, settingsLogic, config, markup, styles, logic, appConfig] = await Promise.all([
    readFile(new URL("index.wxml", settingsRoot), "utf8"),
    readFile(new URL("index.ts", settingsRoot), "utf8"),
    readFile(new URL("profile-edit/index.json", settingsRoot), "utf8"),
    readFile(new URL("profile-edit/index.wxml", settingsRoot), "utf8"),
    readFile(new URL("profile-edit/index.less", settingsRoot), "utf8"),
    readFile(new URL("profile-edit/index.ts", settingsRoot), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
  ]);

  assert.match(settingsMarkup, /aria-label="修改头像和昵称"[\s\S]*?bindtap="handleEditProfileTap"/);
  assert.doesNotMatch(settingsMarkup, /<app-dialog|<image-cropper/);
  assert.match(settingsLogic, /pages\/settings\/profile-edit\/index/);
  assert.match(config, /"app-input": "\/components\/app-input\/index"/);
  assert.match(config, /"image-cropper": "\/components\/image-cropper\/index"/);
  assert.match(markup, /custom-back="\{\{true\}\}"/);
  assert.match(markup, /<image-cropper[\s\S]*?shape="circle"[\s\S]*?bind:confirm="handleAvatarCropConfirm"/);
  assert.match(styles, /\.profile-avatar-editor__button\s*{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(logic, /handleAvatarCropConfirm[\s\S]*?sourceFilePath[\s\S]*?pendingAvatarCrop: crop \|\| null/);
  assert.match(logic, /handleProfileSave\(\)[\s\S]*?updateAccountProfile\(displayName\)[\s\S]*?updateAccountAvatar\([\s\S]*?pendingAvatarUploadPath,[\s\S]*?pendingAvatarCrop/);
  assert.match(appConfig, /pages\/settings\/profile-edit\/index/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const settingsRoot = new URL("../../src/pages/settings/", import.meta.url);

test("settings lets signed-in users edit their nickname and cropped avatar", async () => {
  const [config, markup, styles, logic] = await Promise.all([
    readFile(new URL("index.json", settingsRoot), "utf8"),
    readFile(new URL("index.wxml", settingsRoot), "utf8"),
    readFile(new URL("index.less", settingsRoot), "utf8"),
    readFile(new URL("index.ts", settingsRoot), "utf8"),
  ]);

  assert.match(config, /"app-dialog": "\/components\/app-dialog\/index"/);
  assert.match(config, /"app-input": "\/components\/app-input\/index"/);
  assert.match(config, /"image-cropper": "\/components\/image-cropper\/index"/);
  assert.match(markup, /aria-label="修改头像和昵称"[\s\S]*?bindtap="handleEditProfileTap"/);
  assert.match(markup, /<app-dialog[\s\S]*?title="编辑个人资料"/);
  assert.match(markup, /<image-cropper[\s\S]*?shape="circle"[\s\S]*?bind:confirm="handleAvatarCropConfirm"/);
  assert.match(styles, /\.profile-edit-button\s*\{[\s\S]*?width: 56rpx;[\s\S]*?height: 56rpx/);
  assert.match(logic, /handleAvatarCropConfirm[\s\S]*?sourceFilePath[\s\S]*?pendingAvatarCrop: crop \|\| null/);
  assert.match(logic, /handleProfileSave\(\)[\s\S]*?updateAccountProfile\(displayName\)[\s\S]*?updateAccountAvatar\([\s\S]*?pendingAvatarUploadPath,[\s\S]*?pendingAvatarCrop/);
});

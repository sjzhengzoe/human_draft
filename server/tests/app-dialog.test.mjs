import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

test("app dialog centers within the keyboard-safe viewport", async () => {
  const [componentSource, template, styles] = await Promise.all([
    readFile(new URL("src/components/app-dialog/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.less", projectRoot), "utf8"),
  ]);

  assert.match(componentSource, /wx\.onKeyboardHeightChange/);
  assert.match(componentSource, /wx\.offKeyboardHeightChange/);
  assert.match(componentSource, /keyboardHeight === this\.data\.keyboardHeight/);
  assert.match(componentSource, /padding-bottom: calc\(\$\{keyboardHeight\}px \+ 48rpx\)/);
  assert.match(template, /style="\{\{keyboardStyle\}\}"/);
  assert.match(styles, /align-items: center/);
  assert.match(styles, /max-height: 100%/);
  assert.match(styles, /overflow-y: auto/);
});

test("dialog inputs rely on global keyboard avoidance instead of page pushing", async () => {
  const templates = await Promise.all([
    "src/exercise/pages/index.wxml",
    "src/pages/chat-topics/index.wxml",
    "src/pages/key-moments/index.wxml",
    "src/pages/activities/index.wxml",
  ].map((path) => readFile(new URL(path, projectRoot), "utf8")));

  for (const template of templates) {
    assert.match(template, /adjust-position="\{\{false\}\}"/);
  }
  assert.match(templates.at(-1), /<app-dialog/);
  assert.doesNotMatch(templates.at(-1), /class="modal"/);
});

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
  assert.match(componentSource, /trackKeyboard:[\s\S]*?value:\s*true/);
  assert.match(componentSource, /visible && trackKeyboard/);
  assert.match(componentSource, /keyboardHeight === this\.data\.keyboardHeight/);
  assert.match(componentSource, /padding-bottom: calc\(\$\{keyboardHeight\}px \+ 48rpx\)/);
  assert.match(template, /style="\{\{keyboardStyle\}\}"/);
  assert.match(styles, /align-items: center/);
  assert.match(styles, /\.app-dialog__panel\s*{[^}]*max-height:\s*68vh/);
  assert.match(styles, /\.app-dialog--with-keyboard \.app-dialog__panel\s*{[^}]*max-height:\s*100%/);
  assert.match(styles, /overflow-y: auto/);
});

test("dialog inputs use one keyboard avoidance strategy at a time", async () => {
  const [globalAvoidanceTemplates, activityTemplate] = await Promise.all([
    Promise.all([
      "src/exercise/pages/index.wxml",
      "src/pages/chat-topics/index.wxml",
      "src/pages/key-moments/index.wxml",
    ].map((path) => readFile(new URL(path, projectRoot), "utf8"))),
    readFile(new URL("src/pages/activities/index.wxml", projectRoot), "utf8"),
  ]);

  for (const template of globalAvoidanceTemplates) {
    assert.match(template, /adjust-position="\{\{false\}\}"/);
  }
  assert.match(activityTemplate, /track-keyboard="\{\{false\}\}"/);
  assert.match(activityTemplate, /adjust-position="\{\{false\}\}"/);
  assert.match(activityTemplate, /scroll-into-view="\{\{editorFocusAnchor\}\}"/);
  assert.match(activityTemplate, /<app-dialog/);
  assert.doesNotMatch(activityTemplate, /class="modal"/);
});

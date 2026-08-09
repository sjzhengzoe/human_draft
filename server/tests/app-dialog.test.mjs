import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

test("app dialog caps and scrolls content without mutating layout for the keyboard", async () => {
  const [componentSource, template, styles] = await Promise.all([
    readFile(new URL("src/components/app-dialog/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.less", projectRoot), "utf8"),
  ]);

  assert.doesNotMatch(componentSource, /KeyboardHeight|trackKeyboard|keyboardStyle|setData/);
  assert.doesNotMatch(template, /keyboardHeight|keyboardStyle|style="\{\{/);
  assert.match(styles, /align-items: center/);
  assert.match(styles, /\.app-dialog__panel\s*{[^}]*max-height:\s*68vh/);
  assert.match(styles, /overflow-y: auto/);
  assert.doesNotMatch(styles, /app-dialog--with-keyboard|transition:\s*padding-bottom/);
});

test("dialog inputs use native keyboard avoidance without dialog relayout", async () => {
  const [appInputTemplate, appInputLogic, ...dialogTemplates] = await Promise.all([
    readFile(new URL("src/components/app-input/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-input/index.ts", projectRoot), "utf8"),
    ...[
      "src/pages/activities/index.wxml",
      "src/exercise/pages/index.wxml",
      "src/pages/luggage/index.wxml",
      "src/components/luggage-scene-dialog/index.wxml",
      "src/pages/chat-topics/index.wxml",
      "src/pages/key-moments/index.wxml",
    ].map((path) => readFile(new URL(path, projectRoot), "utf8")),
  ]);

  const [activities, exercise, luggage, luggageScene, chatTopics, keyMoments] = dialogTemplates;
  assert.match(appInputTemplate, /adjust-position="\{\{dialogMode \|\| adjustPosition\}\}"/);
  assert.match(appInputTemplate, /cursor-spacing="\{\{dialogMode \? dialogCursorSpacing : cursorSpacing\}\}"/);
  assert.match(appInputLogic, /dialogCursorSpacing:\s*160/);
  assert.equal(activities.match(/dialog-mode/g)?.length, 2);
  for (const template of [exercise, luggage, luggageScene]) {
    assert.match(template, /dialog-mode/);
  }
  assert.equal(chatTopics.match(/cursor-spacing="160"/g)?.length, 2);
  assert.equal(keyMoments.match(/cursor-spacing="160"/g)?.length, 1);
  for (const template of dialogTemplates) {
    assert.doesNotMatch(template, /adjust-position="\{\{false\}\}"|track-keyboard=/);
  }
});

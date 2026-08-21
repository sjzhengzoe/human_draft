import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

async function listWxmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listWxmlFiles(path));
    else if (path.endsWith(".wxml")) files.push(path);
  }
  return files;
}

test("all page inputs use the shared app-input component", async () => {
  const sourceDirectory = new URL("../../src/", import.meta.url).pathname;
  const componentPath = join(sourceDirectory, "components/app-input/index.wxml");
  const unexpectedNativeInputs = [];
  let sharedInputCount = 0;

  for (const file of await listWxmlFiles(sourceDirectory)) {
    const source = await readFile(file, "utf8");
    sharedInputCount += source.match(/<app-input\b/g)?.length || 0;
    if (file !== componentPath && /<input\b/.test(source)) {
      unexpectedNativeInputs.push(file);
    }
  }

  assert.ok(sharedInputCount > 0);
  assert.deepEqual(unexpectedNativeInputs, []);
});

test("shared app-input keeps the project font outside native editing", async () => {
  const [template, logic, styles] = await Promise.all([
    readFile(new URL("../../src/components/app-input/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-input/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-input/index.less", import.meta.url), "utf8"),
  ]);

  assert.equal(template.match(/<input\b/g)?.length, 1);
  assert.match(template, /always-embed="\{\{dialogMode \? false : true\}\}"/);
  assert.match(template, /font-family: HumanDraftUI/);
  assert.match(template, /font-size: \{\{fontSize\}\}/);
  assert.match(template, /placeholder-style="[^"]*font-size: \{\{fontSize\}\}/);
  assert.match(template, /wx:if="\{\{dialogMode \|\| persistent \|\| editing\}\}"/);
  assert.match(template, /adjust-position="\{\{dialogMode \? false : adjustPosition\}\}"/);
  assert.match(template, /cursor-spacing="\{\{dialogMode \? 0 : cursorSpacing\}\}"/);
  assert.match(template, /wx:else[\s\S]*app-input__display/);
  assert.match(template, /class="app-input__field custom-class"/);
  assert.doesNotMatch(template, /class="app-input__(?:__control|__display)[^"]*custom-class/);
  assert.match(logic, /externalClasses:\s*\["custom-class"\]/);
  assert.match(logic, /persistent:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?value:\s*false/);
  assert.match(logic, /clearable:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?value:\s*true/);
  assert.match(template, /clearable && localValue && !disabled[\s\S]*?class="app-input__clear"[\s\S]*?<app-icon name="x-muted" size="24"/);
  assert.match(logic, /handleClear\(\)[\s\S]*?localValue: ""[\s\S]*?this\.triggerEvent\("input", \{ value: "", cursor: 0 \}\)/);
  assert.match(styles, /\.app-input__clear[^}]*width:\s*56rpx[^}]*height:\s*56rpx/);
  assert.match(styles, /\.app-input__control[^}]*height:\s*100%[^}]*padding:\s*0/s);
  assert.match(logic, /dialogMode:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?value:\s*false/);
  assert.doesNotMatch(logic, /dialogCursorSpacing/);
  assert.match(logic, /fontSize:\s*UI_FONT_SIZES\.base/);
  assert.match(logic, /handleActivate\(\)/);
  assert.match(logic, /handleFocus[\s\S]*?!this\.properties\.persistent && !this\.properties\.dialogMode[\s\S]*?this\.triggerEvent\("focus", event\.detail\)/);
  assert.match(logic, /this\.triggerEvent\("input", event\.detail\)/);
  assert.match(styles, /\.app-input__display[^}]*font-family:\s*var\(--ui-font-family\)/);
  assert.match(styles, /\.app-input__display--placeholder/);
});

test("global field editor owns standalone short-edit dialogs", async () => {
  const [template, logic, styles, config, appConfig, guidance] = await Promise.all([
    readFile(new URL("../../src/components/app-field-editor/index.wxml", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-field-editor/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-field-editor/index.less", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-field-editor/index.json", import.meta.url), "utf8"),
    readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
  ]);

  assert.match(template, /<app-dialog[\s\S]*?placement="bottom"[\s\S]*?title="\{\{title\}\}"/);
  assert.match(template, /<app-input[\s\S]*?type="\{\{type\}\}"[\s\S]*?value="\{\{draftValue\}\}"[\s\S]*?dialog-mode/);
  assert.match(template, /showCount[\s\S]*?draftValue\.length/);
  assert.match(template, /wx:if="\{\{hint\}\}"/);
  assert.match(logic, /this\.triggerEvent\("confirm", \{ value: this\.data\.draftValue \}\)/);
  assert.match(logic, /"visible, value"/);
  assert.match(styles, /\.app-field-editor__input[\s\S]*?var\(--ui-color-border\)/);
  assert.equal(JSON.parse(config).usingComponents["app-dialog"], "/components/app-dialog/index");
  assert.equal(JSON.parse(config).usingComponents["app-input"], "/components/app-input/index");
  assert.equal(JSON.parse(appConfig).usingComponents["app-field-editor"], "/components/app-field-editor/index");
  assert.match(guidance, /standalone short edit containing one field must use the global `app-field-editor`/i);
  assert.match(guidance, /editable values must render as normal text rather than persistent input boxes/i);
});

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
  assert.match(template, /always-embed="\{\{true\}\}"/);
  assert.match(template, /font-family: HumanDraftUI/);
  assert.match(template, /font-size: \{\{fontSize\}\}/);
  assert.match(template, /placeholder-style="[^"]*font-size: \{\{fontSize\}\}/);
  assert.match(template, /wx:if="\{\{dialogMode \|\| persistent \|\| editing\}\}"/);
  assert.match(template, /adjust-position="\{\{dialogMode \|\| adjustPosition\}\}"/);
  assert.match(template, /cursor-spacing="\{\{dialogMode \? dialogCursorSpacing : cursorSpacing\}\}"/);
  assert.match(template, /wx:else[\s\S]*app-input__display/);
  assert.match(logic, /externalClasses:\s*\["custom-class"\]/);
  assert.match(logic, /persistent:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?value:\s*false/);
  assert.match(logic, /dialogMode:\s*\{[\s\S]*?type:\s*Boolean,[\s\S]*?value:\s*false/);
  assert.match(logic, /dialogCursorSpacing:\s*160/);
  assert.match(logic, /fontSize:\s*UI_FONT_SIZES\.base/);
  assert.match(logic, /handleActivate\(\)/);
  assert.match(logic, /handleFocus[\s\S]*?!this\.properties\.persistent && !this\.properties\.dialogMode[\s\S]*?this\.triggerEvent\("focus", event\.detail\)/);
  assert.match(logic, /this\.triggerEvent\("input", event\.detail\)/);
  assert.match(styles, /\.app-input__display[^}]*font-family:\s*var\(--ui-font-family\)/);
  assert.match(styles, /\.app-input__display--placeholder/);
});

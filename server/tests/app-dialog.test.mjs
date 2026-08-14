import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

async function sourceFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    const path = new URL(entry.name, directory);
    if (entry.isDirectory()) paths.push(...await sourceFiles(new URL(`${entry.name}/`, directory), extension));
    else if (entry.name.endsWith(extension)) paths.push(path);
  }
  return paths;
}

test("app dialog owns center, bottom, fullscreen, and keyboard-aware bottom placement", async () => {
  const [componentSource, template, styles, inputTemplate] = await Promise.all([
    readFile(new URL("src/components/app-dialog/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.less", projectRoot), "utf8"),
    readFile(new URL("src/components/app-input/index.wxml", projectRoot), "utf8"),
  ]);

  assert.match(componentSource, /placement:[\s\S]*?value: "center"/);
  assert.match(componentSource, /wx\.onKeyboardHeightChange/);
  assert.match(componentSource, /wx\.offKeyboardHeightChange/);
  assert.match(template, /app-dialog--bottom/);
  assert.match(template, /translate3d\(0, -/);
  assert.match(styles, /\.app-dialog__panel\s*{[^}]*max-height:\s*68vh/);
  assert.match(styles, /\.app-dialog--bottom\s*{[^}]*align-items:\s*flex-end/);
  assert.match(styles, /\.app-dialog--bottom \.app-dialog__panel\s*{[^}]*max-height:\s*78vh/);
  assert.match(inputTemplate, /adjust-position="\{\{dialogMode \? false : adjustPosition\}\}"/);
  assert.match(inputTemplate, /cursor-spacing="\{\{dialogMode \? 0 : cursorSpacing\}\}"/);
});

test("every dialog containing an input uses the shared bottom placement", async () => {
  const templates = await sourceFiles(new URL("src/", projectRoot), ".wxml");
  let inputDialogCount = 0;
  for (const path of templates) {
    const source = await readFile(path, "utf8");
    for (const dialog of source.match(/<app-dialog\b[\s\S]*?<\/app-dialog>/g) || []) {
      if (!/<(?:input|textarea|app-input)\b/.test(dialog)) continue;
      inputDialogCount += 1;
      assert.match(dialog, /placement="bottom"/, `input dialog must be bottom placed: ${path.pathname}`);
      assert.doesNotMatch(dialog, /adjust-position="\{\{true\}\}"|cursor-spacing="160"/);
    }
  }
  assert.ok(inputDialogCount >= 5);

  const scripts = await sourceFiles(new URL("src/", projectRoot), ".ts");
  for (const path of scripts) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /editable:\s*true/, `native editable modal remains: ${path.pathname}`);
  }
});

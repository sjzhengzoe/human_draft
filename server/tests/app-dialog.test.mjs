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
  const [componentSource, template, styles, inputTemplate, inputSource] = await Promise.all([
    readFile(new URL("src/components/app-dialog/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-dialog/index.less", projectRoot), "utf8"),
    readFile(new URL("src/components/app-input/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/components/app-input/index.ts", projectRoot), "utf8"),
  ]);

  assert.match(componentSource, /placement:[\s\S]*?value: "center"/);
  assert.match(componentSource, /wx\.onKeyboardHeightChange/);
  assert.match(componentSource, /wx\.offKeyboardHeightChange/);
  assert.match(template, /app-dialog--bottom/);
  assert.match(template, /app-dialog--keyboard-open/);
  assert.match(template, /padding-bottom: ' \+ keyboardHeight \+ 'px/);
  assert.doesNotMatch(template, /translate3d/);
  assert.match(styles, /\.app-dialog__panel\s*{[^}]*max-height:\s*68vh/);
  assert.match(styles, /\.app-dialog--bottom\s*{[^}]*align-items:\s*flex-end/);
  assert.match(styles, /\.app-dialog--bottom \.app-dialog__panel\s*{[^}]*max-height:\s*78vh/);
  assert.match(styles, /\.app-dialog--bottom\.app-dialog--keyboard-open \.app-dialog__actions[\s\S]*?padding-bottom:\s*24rpx/);
  assert.match(inputTemplate, /adjust-position="\{\{dialogMode \? false : adjustPosition\}\}"/);
  assert.match(inputTemplate, /cursor-spacing="\{\{dialogMode \? 0 : cursorSpacing\}\}"/);
  assert.match(inputTemplate, /always-embed="\{\{dialogMode \? false : true\}\}"/);
  assert.match(inputSource, /maxlength:[\s\S]*?value: 120/);
  assert.match(inputSource, /ready\(\)[\s\S]*?wx\.nextTick/);
  assert.match(inputSource, /nativeFocus: this\.properties\.focus && !this\.properties\.disabled && !this\.properties\.dialogMode/);
});

test("every dialog containing an input uses the shared bottom placement", async () => {
  const templates = await sourceFiles(new URL("src/", projectRoot), ".wxml");
  let inputDialogCount = 0;
  const inputDialogActionRules = [];
  for (const path of templates) {
    const source = await readFile(path, "utf8");
    for (const dialog of source.match(/<app-dialog\b[\s\S]*?<\/app-dialog>/g) || []) {
      if (!/<(?:input|textarea|app-input)\b/.test(dialog)) continue;
      inputDialogCount += 1;
      assert.match(dialog, /placement="bottom"/, `input dialog must be bottom placed: ${path.pathname}`);
      assert.doesNotMatch(dialog, /adjust-position="\{\{true\}\}"|cursor-spacing="160"/);
      for (const control of dialog.match(/<(?:input|textarea|app-input)\b[\s\S]*?\/>/g) || []) {
        if (/^<app-input\b/.test(control)) {
          assert.match(control, /dialog-mode/, `dialog app-input must use dialog mode: ${path.pathname}`);
        } else {
          assert.match(control, /adjust-position="\{\{false\}\}"/, `native dialog input must disable page adjustment: ${path.pathname}`);
        }
        assert.doesNotMatch(control, /always-embed="\{\{true\}\}"/, `dialog input must not force iOS same-layer rendering: ${path.pathname}`);
      }
      for (const actions of dialog.match(/<[a-z-]+\b[^>]*slot="actions"[^>]*>/g) || []) {
        const classes = actions.match(/class="([^"]+)"/)?.[1].split(/\s+/) || [];
        for (const className of classes) {
          inputDialogActionRules.push({
            stylesheet: new URL(path.href.replace(/\.wxml$/, ".less")),
            className,
          });
        }
      }
    }
  }
  assert.ok(inputDialogCount >= 10);

  const scripts = await sourceFiles(new URL("src/", projectRoot), ".ts");
  const keyboardTrackingScripts = [];
  for (const path of scripts) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /editable:\s*true/, `native editable modal remains: ${path.pathname}`);
    if (/wx\.onKeyboardHeightChange/.test(source)) keyboardTrackingScripts.push(path.pathname);
  }
  assert.equal(keyboardTrackingScripts.length, 1);
  assert.ok(keyboardTrackingScripts[0].endsWith("/src/components/app-dialog/index.ts"));

  for (const { stylesheet, className } of inputDialogActionRules) {
    const source = await readFile(stylesheet, "utf8");
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rulePattern = new RegExp(`\\.${escapedClassName}\\s*\\{[^}]*\\}`, "g");
    for (const rule of source.match(rulePattern) || []) {
      assert.doesNotMatch(rule, /safe-area-inset-bottom/, `dialog actions must leave keyboard and safe-area spacing to app-dialog: ${stylesheet.pathname}`);
    }
  }
});

test("text edit guidance separates short bottom sheets from long page editors", async () => {
  const [agentGuidance, typographyGuidance] = await Promise.all([
    readFile(new URL("AGENTS.md", projectRoot), "utf8"),
    readFile(new URL("docs/ui-typography.md", projectRoot), "utf8"),
  ]);

  for (const guidance of [agentGuidance, typographyGuidance]) {
    assert.match(guidance, /120/);
    assert.match(guidance, /200[–-]500/);
    assert.match(guidance, /textarea/);
  }

  const templates = await sourceFiles(new URL("src/", projectRoot), ".wxml");
  for (const path of templates) {
    if (path.pathname.endsWith("/components/app-input/index.wxml")) continue;
    const source = await readFile(path, "utf8");
    for (const input of source.match(/<app-input\b[\s\S]*?\/>/g) || []) {
      const maxlength = Number(input.match(/maxlength="(\d+)"/)?.[1] || 0);
      assert.ok(
        maxlength <= 120,
        `long text must use a textarea instead of app-input: ${path.pathname}`,
      );
    }
    for (const dialog of source.match(/<app-dialog\b[\s\S]*?<\/app-dialog>/g) || []) {
      for (const control of dialog.match(/<(?:input|textarea|app-input)\b[\s\S]*?\/>/g) || []) {
        const maxlength = Number(control.match(/maxlength="(\d+)"/)?.[1] || 0);
        assert.ok(
          maxlength <= 120,
          `long text must not use a dialog: ${path.pathname}`,
        );
      }
    }
  }
});

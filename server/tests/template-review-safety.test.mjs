import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../../", import.meta.url);

test("template pages distinguish examples and expose safe action states", async () => {
  const workspaceTemplate = await readFile(
    new URL("src/components/text-card-workspace/index.wxml", projectRoot),
    "utf8",
  );

  const templatePaths = [
    "components/text-card-template-one",
    "pages/douyin2",
    "pages/douyin3",
  ];
  for (const templatePath of templatePaths) {
    const source = await readFile(
      new URL(`src/${templatePath}/index.ts`, projectRoot),
      "utf8",
    );
    const template = await readFile(
      new URL(`src/${templatePath}/index.wxml`, projectRoot),
      "utf8",
    );

    assert.match(source, /hasCustomContent/);
    assert.match(source, /isExampleContent/);
    assert.match(source, /persist: false/);
    assert.match(source, /ensureTextCardContentSafe/);
    assert.match(source, /showClearUndo/);
    assert.match(source, /renderErrorMessage/);
    assert.match(template, /text-card-workspace/);
    assert.match(template, /is-example-content=/);
    assert.match(template, /export-ready=/);
  }

  assert.match(workspaceTemplate, /当前是默认文案/);
  assert.match(workspaceTemplate, /请编辑文案/);
  assert.match(workspaceTemplate, /text-card-undo-bar/);
  assert.match(workspaceTemplate, /has-content=/);
  assert.match(workspaceTemplate, /重新生成/);
  assert.match(workspaceTemplate, /图文卡片/);

  const sharedActions = await readFile(
    new URL("src/features/text-card/page-actions.ts", projectRoot),
    "utf8",
  );
  assert.match(sharedActions, /await checkTextContent\(content\)/);

  const editor = await readFile(
    new URL("src/pages/editor/index.ts", projectRoot),
    "utf8",
  );
  assert.match(editor, /await checkTextContent\(content\)/);
  assert.match(editor, /originalContent/);
  assert.match(editor, /getDraftStorageKey/);

  const editorTemplate = await readFile(
    new URL("src/pages/editor/index.wxml", projectRoot),
    "utf8",
  );
  assert.match(editorTemplate, /custom-back=/);
  assert.match(editorTemplate, /app-dialog/);
  assert.match(editorTemplate, /characterCount/);
  assert.match(editorTemplate, /maxlength=/);

  const actionBar = await readFile(
    new URL("src/components/text-card-action-bar/index.ts", projectRoot),
    "utf8",
  );
  assert.match(actionBar, /hasContent/);
  assert.match(actionBar, /exportReady/);

  const imageTemplate = await readFile(
    new URL("src/pages/douyin3/index.ts", projectRoot),
    "utf8",
  );
  assert.match(imageTemplate, /pageKeys/);
  assert.match(imageTemplate, /createLocalImageBindingsStore/);

  const localImageBindings = await readFile(
    new URL("src/features/text-card/local-image-bindings.ts", projectRoot),
    "utf8",
  );
  assert.match(localImageBindings, /StoredImageBindings/);
  assert.match(localImageBindings, /pageKey/);
});

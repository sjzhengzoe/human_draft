import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("template pages distinguish examples and expose safe action states", async () => {
  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const source = await readFile(
      new URL(`src/pages/${page}/index.ts`, projectRoot),
      "utf8",
    );
    const template = await readFile(
      new URL(`src/pages/${page}/index.wxml`, projectRoot),
      "utf8",
    );

    assert.match(source, /hasCustomContent/);
    assert.match(source, /isExampleContent/);
    assert.match(source, /persist: false/);
    assert.match(source, /checkTextContent/);
    assert.match(source, /showClearUndo/);
    assert.match(source, /renderErrorMessage/);
    assert.match(template, /当前是默认文案/);
    assert.match(template, /请编辑文案/);
    assert.match(template, /text-card-undo-bar/);
    assert.match(template, /has-content=/);
    assert.match(template, /export-ready=/);
    assert.match(template, /重新生成/);
    assert.match(template, /图文分卡/);
  }

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
  assert.match(editorTemplate, /formatHint/);

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
  assert.match(imageTemplate, /StoredImageBindings/);
});

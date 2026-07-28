import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("template pages show a useful empty state and check user text", async () => {
  for (const page of ["xiaohongshu", "douyin2"]) {
    const source = await readFile(
      new URL(`src/pages/${page}/index.ts`, projectRoot),
      "utf8",
    );
    const template = await readFile(
      new URL(`src/pages/${page}/index.wxml`, projectRoot),
      "utf8",
    );

    assert.match(source, /hasCustomContent/);
    assert.match(source, /checkTextContent/);
    assert.match(template, /当前是默认文案/);
    assert.match(template, /请编辑文案/);
  }

  const editor = await readFile(
    new URL("src/pages/editor/index.ts", projectRoot),
    "utf8",
  );
  assert.match(editor, /await checkTextContent\(content\)/);
});

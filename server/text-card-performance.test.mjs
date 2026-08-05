import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../", import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

function getMethodSource(source, methodName, nextMethodName) {
  const startMatch = source.match(
    new RegExp(`\\n      (?:async )?${methodName}\\(`)
  )
  const start = startMatch?.index ?? -1
  const remainingSource = source.slice(start + 1)
  const endMatch = remainingSource.match(
    new RegExp(`\\n      (?:async )?${nextMethodName}\\(`)
  )
  const end = endMatch?.index === undefined ? -1 : start + 1 + endMatch.index
  assert.ok(start >= 0 && end > start, `无法定位 ${methodName}`)
  return source.slice(start, end)
}

test("text card previews stay lightweight, cached, and cancellable", async () => {
  const [templateOne, templateTwo, templateThree, previewCache] =
    await Promise.all([
      readProjectFile("src/pages/xiaohongshu/index.ts"),
      readProjectFile("src/pages/douyin2/index.ts"),
      readProjectFile("src/pages/douyin3/index.ts"),
      readProjectFile("src/services/text-card-preview-cache.ts")
    ])

  assert.match(templateOne, /PREVIEW_CANVAS_WIDTH = BASE_CANVAS_WIDTH/)
  for (const source of [templateTwo, templateThree]) {
    assert.match(source, /PREVIEW_CANVAS_WIDTH = 1080/)
    assert.match(source, /quality === "preview"/)
    assert.match(source, /isStalePreview/)
    assert.match(source, /cacheTextCardPreview/)
    assert.match(source, /loadCanvasImage\(canvas, BACKGROUND_IMAGE\)/)
  }

  assert.doesNotMatch(templateThree, /getImageData/)
  assert.match(previewCache, /MAX_PREVIEW_CACHE_ENTRIES = 8/)

  await assert.rejects(
    access(new URL("src/pages/douyin2/index.js", projectRoot))
  )
})

test("content security checks new input but not copy or export output", async () => {
  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const source = await readProjectFile(`src/pages/${page}/index.ts`)
    const copySource = getMethodSource(
      source,
      "handleCopyContent",
      "handleSaveImages"
    )
    const exportSource = getMethodSource(
      source,
      "handleSaveImages",
      "refreshRenderedImages"
    )

    assert.match(source, /ensureSafeContent/)
    assert.doesNotMatch(copySource, /ensureSafeContent/)
    assert.doesNotMatch(exportSource, /ensureSafeContent/)
  }

  const editor = await readProjectFile("src/pages/editor/index.ts")
  assert.match(editor, /await checkTextContent\(content\)/)
})

test("text card UI exposes preview and high-resolution export states", async () => {
  const actionBar = await readProjectFile(
    "src/components/text-card-action-bar/index.ts"
  )
  assert.match(actionBar, /label: "导出高清"/)
  assert.match(actionBar, /key: "copy"/)
  assert.match(actionBar, /key: "clear"/)
  assert.doesNotMatch(actionBar, /showMoreDialog|key: "more"/)

  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const template = await readProjectFile(`src/pages/${page}/index.wxml`)
    assert.match(template, /正在更新预览/)
    assert.match(template, /预览 ·/)
    assert.doesNotMatch(template, /show-menu-by-longpress/)
  }
})

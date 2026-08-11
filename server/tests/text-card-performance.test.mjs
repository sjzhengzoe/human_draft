import assert from "node:assert/strict"
import { access, readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

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
      readProjectFile("src/components/text-card-template-one/index.ts"),
      readProjectFile("src/components/text-card-template-two/index.ts"),
      readProjectFile("src/components/text-card-template-three/index.ts"),
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
    access(new URL("src/components/text-card-template-two/index.js", projectRoot))
  )
})

test("combined text cards grow with content without blocking the remaining previews", async () => {
  const [templateOne, template, workspace, workspaceStyle] = await Promise.all([
    readProjectFile("src/components/text-card-template-one/index.ts"),
    readProjectFile("src/components/text-card-template-one/index.wxml"),
    readProjectFile("src/components/text-card-workspace/index.wxml"),
    readProjectFile("src/components/text-card-workspace/index.less")
  ])
  const combinedRender = getMethodSource(
    templateOne,
    "generateCombinedImage",
    "getExportCanvas"
  )

  assert.match(templateOne, /MAX_COMBINED_CANVAS_HEIGHT_RATIO = 16 \/ 9/)
  assert.match(
    combinedRender,
    /requiredCanvasHeight =[\s\S]*?layout\.height \+ metrics\.combinedSafeY \* 2/
  )
  assert.match(
    combinedRender,
    /Math\.min\([\s\S]*?Math\.max\(metrics\.height, requiredCanvasHeight\)[\s\S]*?maxCanvasHeight/
  )
  assert.match(combinedRender, /const textTop = Math\.max\(/)
  assert.match(
    combinedRender,
    /return canvasToTempFilePath\(canvas, metrics\.width, canvasHeight\)/
  )
  assert.doesNotMatch(combinedRender, /throw new Error/)
  assert.doesNotMatch(templateOne, /合并版内容过长|减少卡片或精简文案/)
  assert.match(template, /fit-adaptive-images="\{\{true\}\}"/)
  assert.match(workspace, /bindload="handleCardImageLoad"/)
  assert.match(workspace, /imageDisplayStyles\[index\]/)
  assert.match(
    workspaceStyle,
    /width: var\(--card-item-width, 600rpx\);/
  )
})

test("xiaohongshu previews publish each completed card immediately", async () => {
  const [templateOne, template, workspace, workspaceController] =
    await Promise.all([
      readProjectFile("src/components/text-card-template-one/index.ts"),
      readProjectFile("src/components/text-card-template-one/index.wxml"),
      readProjectFile("src/components/text-card-workspace/index.wxml"),
      readProjectFile("src/components/text-card-workspace/index.ts")
    ])
  const refreshRender = getMethodSource(
    templateOne,
    "refreshRenderedImages",
    "retryPreview"
  )
  const generateImages = getMethodSource(
    templateOne,
    "generateImages",
    "generateSlideImage"
  )

  assert.match(refreshRender, /renderedImageUrls: \[\]/)
  assert.match(
    refreshRender,
    /\(readyUrls\) => \{[\s\S]*?renderedImageUrls: readyUrls,[\s\S]*?renderProgressText:/
  )
  assert.ok(
    (generateImages.match(/onImageReady\?\.\(\[\.\.\.urls\]\)/g) || [])
      .length >= 2
  )
  assert.match(template, /progressive-rendering="\{\{true\}\}"/)
  assert.match(
    workspace,
    /isRenderingCards && !progressiveRendering/
  )
  assert.match(workspace, /生成中 \{\{renderProgressText\}\}/)
  assert.match(
    workspaceController,
    /url === this\.data\.measuredImageUrls\[index\]/
  )
})

test("text card pages share presentation and render infrastructure", async () => {
  const templateBases = [
    "components/text-card-template-one",
    "components/text-card-template-two",
    "components/text-card-template-three"
  ]
  const [
    pageSources,
    pageStyles,
    pageTemplates,
    sharedRender,
    workspaceStyle,
    hostStyle,
    exportStyle
  ] = await Promise.all([
    Promise.all(
      templateBases.map((base) => readProjectFile(`src/${base}/index.ts`))
    ),
    Promise.all(
      templateBases.map((base) => readProjectFile(`src/${base}/index.less`))
    ),
    Promise.all(
      templateBases.map((base) => readProjectFile(`src/${base}/index.wxml`))
    ),
    readProjectFile("src/utils/text-card-render.ts"),
    readProjectFile("src/components/text-card-workspace/index.less"),
    readProjectFile("src/pages/text-card/index.less"),
    readProjectFile("src/styles/text-card-export.less")
  ])

  for (const source of pageSources) {
    assert.match(source, /from "\.\.\/\.\.\/utils\/text-card-render"/)
    assert.doesNotMatch(source, /function saveImageToPhotosAlbum/)
    assert.doesNotMatch(source, /let renderChain = Promise\.resolve\(\)/)
  }

  for (const style of pageStyles) {
    assert.match(style, /@import "\.\.\/\.\.\/styles\/text-card-export\.less"/)
  }

  for (const template of pageTemplates) {
    assert.match(template, /text-card-workspace/)
  }

  assert.match(sharedRender, /export function createRenderQueue/)
  assert.match(sharedRender, /export function canvasToTempFilePath/)
  assert.doesNotMatch(workspaceStyle, /\.template-switch__item/)
  assert.match(hostStyle, /\.template-switch/)
  assert.match(workspaceStyle, /\.card-preview-overlay/)
  assert.match(workspaceStyle, /\.circle-image-picker/)
  assert.match(exportStyle, /\.export-canvas/)
})

test("content security checks new input but not copy or export output", async () => {
  const templateBases = [
    "components/text-card-template-one",
    "components/text-card-template-two",
    "components/text-card-template-three"
  ]
  for (const base of templateBases) {
    const source = await readProjectFile(`src/${base}/index.ts`)
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

    assert.match(source, /ensureTextCardContentSafe/)
    assert.doesNotMatch(copySource, /ensureTextCardContentSafe/)
    assert.doesNotMatch(exportSource, /ensureTextCardContentSafe/)
  }

  const sharedActions = await readProjectFile(
    "src/features/text-card/page-actions.ts"
  )
  assert.match(sharedActions, /await checkTextContent\(content\)/)

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

  const workspaceTemplate = await readProjectFile(
    "src/components/text-card-workspace/index.wxml"
  )
  assert.match(workspaceTemplate, /正在更新预览/)
  assert.match(workspaceTemplate, /预览 ·/)

  const templateBases = [
    "components/text-card-template-one",
    "components/text-card-template-two",
    "components/text-card-template-three"
  ]
  for (const base of templateBases) {
    const template = await readProjectFile(`src/${base}/index.wxml`)
    assert.match(template, /text-card-workspace/)
    assert.doesNotMatch(template, /show-menu-by-longpress/)
  }
})

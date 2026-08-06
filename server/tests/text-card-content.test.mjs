import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

async function loadTypescriptModule(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)
}

test("bracketed text cards preserve their existing copy and paste rules", async () => {
  const { createTextCardContentParser } = await loadTypescriptModule(
    "../../src/features/text-card/content.ts"
  )
  const parser = createTextCardContentParser({
    format: "bracketed",
    tags: "#标签"
  })
  const content = "［第一张］\n内容一\n\n［第二张］\n内容二"

  assert.equal(parser.getContentSlides(content).length, 2)
  assert.equal(parser.getCopyableContent(content), "内容一\n\n内容二\n\n#标签")
  assert.equal(
    parser.appendPastedContent(content, "新增内容"),
    `${content}\n\n［第 3 张］\n新增内容`
  )
})

test("numbered text cards preserve numeric pages and normalize braille blanks", async () => {
  const { createTextCardContentParser } = await loadTypescriptModule(
    "../../src/features/text-card/content.ts"
  )
  const parser = createTextCardContentParser({
    format: "numbered",
    tags: "#标签"
  })
  const content = "01\n内容一\n\n02\n内容二"

  assert.equal(parser.getContentSlides(content).length, 2)
  assert.equal(parser.normalizeText("内容\u2800文本`"), "内容 文本")
  assert.equal(
    parser.appendPastedContent(content, "新增内容"),
    `${content}\n\n03\n新增内容`
  )
  assert.deepEqual(parser.getParagraphs("01\n\n正文"), [
    { parts: [{ text: "01" }], isTitle: true, isSpacer: false },
    { parts: [], isTitle: false, isSpacer: true },
    { parts: [{ text: "正文" }], isTitle: false, isSpacer: false }
  ])
})

test("xiaohongshu content keeps slide, append, and platform copy rules", async () => {
  const contentModule = await loadTypescriptModule(
    "../../src/features/text-card/xiaohongshu-content.ts"
  )
  const content = "# 标题\n01\n内容一\n\n第二段\n02\n内容二"

  assert.deepEqual(contentModule.getContentSlides(content), [
    { order: "01", paragraphs: ["内容一", "第二段"] },
    { order: "02", paragraphs: ["内容二"] }
  ])
  assert.equal(contentModule.getNextSlideOrder(content), "03")
  assert.equal(contentModule.createPastedEntry("# 新标题\n新增内容", "03"), "03\n新增内容")
  assert.equal(
    contentModule.appendPastedEntry(content, "03\n新增内容"),
    `${content}\n\n03\n新增内容`
  )
  assert.match(contentModule.getXiaohongshuCopyableContent(content), /#日记复兴计划/)
  assert.match(contentModule.getDouyinCopyableContent(content), /#文字的力量/)
  assert.doesNotMatch(contentModule.getDouyinCopyableContent(content), /# 标题/)
})

import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)
const sourceRoot = new URL("../../src/", import.meta.url)
const allowedFontSizes = new Set([
  "var(--ui-font-size-small)",
  "var(--ui-font-size-base)",
  "var(--ui-font-size-large)"
])

async function listFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryUrl = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directoryUrl)
    return entry.isDirectory() ? listFiles(entryUrl) : [entryUrl]
  }))
  return files.flat()
}

function projectPath(fileUrl) {
  return decodeURIComponent(fileUrl.pathname).replace(decodeURIComponent(projectRoot.pathname), "")
}

test("all UI styles use only the shared small, base, and large font variables", async () => {
  const files = (await listFiles(sourceRoot)).filter((file) => /\.(?:less|wxss)$/.test(file.pathname))

  for (const file of files) {
    const source = await readFile(file, "utf8")
    const declarations = [...source.matchAll(/font-size\s*:\s*([^;}\n]+)/g)]
    for (const declaration of declarations) {
      assert.ok(
        allowedFontSizes.has(declaration[1].trim()),
        `${projectPath(file)} contains an unshared font size: ${declaration[1].trim()}`
      )
    }

    if (!file.pathname.endsWith("/src/app.less")) {
      assert.doesNotMatch(
        source,
        /--ui-font-size-(?:small|base|large)\s*:/,
        `${projectPath(file)} must not override the global typography scale`
      )
    }
  }
})

test("ordinary tabs, filters, and mutually exclusive options use the base size", async () => {
  const files = (await listFiles(sourceRoot)).filter((file) => /\.less$/.test(file.pathname))
  const ordinaryControlSelector = /(?:\btab\b|[\w-]+-tab\b|tabs?__button|switch__(?:item|button)|filter__item|category-chip|status-option|type-option|platform-option|meal-period-option|choice-option|city-chip)/

  for (const file of files) {
    const source = await readFile(file, "utf8")
    for (const block of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = block[1].trim()
      const body = block[2]
      if (!ordinaryControlSelector.test(selector) || !/font-size\s*:/.test(body)) continue
      assert.match(
        body,
        /font-size\s*:\s*var\(--ui-font-size-base\)/,
        `${projectPath(file)} ${selector} must use the base font size`
      )
    }
  }
})

test("bottom navigation labels receive the concrete shared small font size", async () => {
  const [styles, logic, page] = await Promise.all([
    readFile(new URL("../../src/custom-tab-bar/index.wxss", import.meta.url), "utf8"),
    readFile(new URL("../../src/custom-tab-bar/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/custom-tab-bar/index.wxml", import.meta.url), "utf8")
  ])

  assert.doesNotMatch(styles, /\.tabbar__text\s*\{[^}]*font-size:/s)
  assert.match(logic, /import \{ UI_FONT_SIZES \} from "\.\.\/styles\/typography"/)
  assert.match(logic, /fontSize: UI_FONT_SIZES\.small/)
  assert.match(page, /class="tabbar__text" style="font-size: \{\{fontSize\}\};"/)
})

test("native controls and Canvas obtain concrete sizes from the shared typography constants", async () => {
  const [typography, appInput, footprintRenderer, ...files] = await Promise.all([
    readFile(new URL("../../src/styles/typography.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/app-input/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/utils/footprint-map.ts", import.meta.url), "utf8"),
    ...(await listFiles(sourceRoot))
      .filter((file) => /\.(?:wxml|ts)$/.test(file.pathname))
      .map((file) => readFile(file, "utf8"))
  ])

  assert.match(typography, /small:\s*"20rpx"/)
  assert.match(typography, /base:\s*"23rpx"/)
  assert.match(typography, /large:\s*"25rpx"/)
  assert.match(appInput, /fontSize:\s*UI_FONT_SIZES\.base/)
  assert.match(footprintRenderer, /UI_CANVAS_FONT_SIZES\.small/)

  for (const source of files) {
    assert.doesNotMatch(source, /font-size="\d+rpx"/)
    assert.doesNotMatch(source, /placeholder-style="[^"]*font-size:\s*\d+rpx/)
  }
})

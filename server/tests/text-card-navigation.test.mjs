import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const navigationUrl = new URL(
  "../../src/features/text-card/template-navigation.ts",
  import.meta.url
)

async function loadNavigationModule() {
  const source = await readFile(navigationUrl, "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)
}

function installNavigationMocks(routes) {
  const calls = []
  globalThis.getCurrentPages = () => routes.map((route) => ({ route }))
  globalThis.wx = {
    navigateBack(options) {
      calls.push(["navigateBack", options])
    },
    navigateTo(options) {
      calls.push(["navigateTo", options])
    },
    redirectTo(options) {
      calls.push(["redirectTo", options])
    },
    switchTab(options) {
      calls.push(["switchTab", options])
    }
  }
  return calls
}

test("text card template switching uses smooth stack navigation", async () => {
  const { switchTextCardTemplate } = await loadNavigationModule()
  const calls = installNavigationMocks([
    "pages/create/index",
    "pages/xiaohongshu/index"
  ])
  let beforeNavigateCount = 0

  switchTextCardTemplate("douyin2", "xiaohongshu", () => {
    beforeNavigateCount += 1
  })

  assert.equal(beforeNavigateCount, 1)
  assert.equal(calls[0][0], "navigateTo")
  assert.equal(calls[0][1].url, "/pages/douyin2/index")
  assert.equal(calls.some(([method]) => method === "redirectTo"), false)
})

test("switching to an existing template reuses it without adding a page", async () => {
  const { switchTextCardTemplate } = await loadNavigationModule()
  const calls = installNavigationMocks([
    "pages/create/index",
    "pages/xiaohongshu/index",
    "pages/douyin2/index",
    "pages/douyin3/index"
  ])

  switchTextCardTemplate("xiaohongshu", "douyin3", () => {})

  assert.deepEqual(calls, [["navigateBack", { delta: 2 }]])
})

test("text card back action skips template switching history", async () => {
  const { navigateBackFromTextCardTemplates } = await loadNavigationModule()
  const calls = installNavigationMocks([
    "pages/create/index",
    "pages/xiaohongshu/index",
    "pages/douyin2/index",
    "pages/douyin3/index"
  ])

  navigateBackFromTextCardTemplates()

  assert.deepEqual(calls, [["navigateBack", { delta: 3 }]])
})

test("direct text card entry returns to the home tab", async () => {
  const { navigateBackFromTextCardTemplates } = await loadNavigationModule()
  const calls = installNavigationMocks(["pages/douyin2/index"])

  navigateBackFromTextCardTemplates()

  assert.deepEqual(calls, [
    ["switchTab", { url: "/pages/create/index" }]
  ])
})

test("all text card pages wire the shared back action", async () => {
  const projectRoot = new URL("../../", import.meta.url)
  const workspace = await readFile(
    new URL("src/components/text-card-workspace/index.wxml", projectRoot),
    "utf8"
  )
  assert.match(workspace, /custom-back="\{\{true\}\}"/)
  assert.match(workspace, /bind:back="handleNavigationBack"/)

  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const template = await readFile(
      new URL(`src/pages/${page}/index.wxml`, projectRoot),
      "utf8"
    )
    assert.match(template, /bind:navigationback="handleNavigationBack"/)
  }
})

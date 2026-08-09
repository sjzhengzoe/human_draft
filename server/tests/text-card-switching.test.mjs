import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const projectRoot = new URL("../../", import.meta.url)

function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

async function loadHostDefinition() {
  const source = await readProjectFile("src/pages/text-card/index.ts")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText
  let definition
  globalThis.Component = (value) => {
    definition = value
  }
  await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`)
  return definition
}

test("template switching changes host state without navigating", async () => {
  const definition = await loadHostDefinition()
  const updates = []
  const context = {
    data: { activeTemplate: "xiaohongshu" },
    setData(update) {
      updates.push(update)
    }
  }

  definition.methods.handleTemplateChange.call(context, {
    detail: { template: "douyin3" }
  })

  assert.deepEqual(updates, [
    {
      activeTemplate: "douyin3",
      "mountedTemplates.douyin3": true
    }
  ])
  assert.doesNotMatch(
    await readProjectFile("src/pages/text-card/index.ts"),
    /navigateTo|navigateBack|redirectTo/
  )
})

test("the host lazily mounts and then preserves all three templates", async () => {
  const [app, homeModules, hostTemplate, hostConfig] = await Promise.all([
    readProjectFile("src/app.json"),
    readProjectFile("src/utils/home-modules.js"),
    readProjectFile("src/pages/text-card/index.wxml"),
    readProjectFile("src/pages/text-card/index.json")
  ])

  assert.ok(JSON.parse(app).pages.includes("pages/text-card/index"))
  assert.match(homeModules, /path: "\/pages\/text-card\/index"/)
  assert.equal(hostTemplate.match(/wx:if="\{\{mountedTemplates\./g)?.length, 3)
  assert.equal(hostTemplate.match(/hidden="\{\{activeTemplate !==/g)?.length, 3)
  assert.equal(hostTemplate.match(/bind:templatechange="handleTemplateChange"/g)?.length, 3)
  assert.deepEqual(Object.keys(JSON.parse(hostConfig).usingComponents), [
    "text-card-template-one",
    "text-card-template-two",
    "text-card-template-three"
  ])
})

test("template components only report the selected value to the host", async () => {
  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const [logic, config] = await Promise.all([
      readProjectFile(`src/pages/${page}/index.ts`),
      readProjectFile(`src/pages/${page}/index.json`)
    ])
    assert.match(logic, /this\.triggerEvent\("templatechange", event\.detail\)/)
    assert.doesNotMatch(logic, /switchTextCardTemplate|redirectToTextCardTemplate/)
    assert.equal(JSON.parse(config).component, true)
  }
})

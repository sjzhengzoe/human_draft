import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const projectRoot = new URL("../../", import.meta.url)
let moduleLoadCount = 0

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
  await import(
    `data:text/javascript;base64,${Buffer.from(output).toString("base64")}#${moduleLoadCount++}`
  )
  return definition
}

test("template switching changes host state without navigating", async () => {
  const definition = await loadHostDefinition()
  const updates = []
  const context = {
    data: { activeTemplate: "xiaohongshu" },
    selectComponent() {
      return { prepareTemplateSwitch: () => true }
    },
    setData(update) {
      updates.push(update)
    }
  }

  definition.methods.handleTemplateTap.call(context, {
    currentTarget: { dataset: { template: "douyin3" } }
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

test("the host keeps one persistent native switch and preserves all three templates", async () => {
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
  assert.equal(hostTemplate.match(/bindtap="handleTemplateTap"/g)?.length, 1)
  assert.ok(hostTemplate.indexOf("class=\"template-switch\"") < hostTemplate.indexOf("text-card-page__content"))
  assert.deepEqual(Object.keys(JSON.parse(hostConfig).usingComponents), [
    "custom-navigation",
    "text-card-template-one",
    "text-card-template-two",
    "text-card-template-three"
  ])
})

test("template components expose a guarded switch hook to the host", async () => {
  for (const page of ["xiaohongshu", "douyin2", "douyin3"]) {
    const [logic, config] = await Promise.all([
      readProjectFile(`src/pages/${page}/index.ts`),
      readProjectFile(`src/pages/${page}/index.json`)
    ])
    assert.match(logic, /prepareTemplateSwitch\(\)/)
    assert.match(logic, /return false/)
    assert.doesNotMatch(logic, /triggerEvent\("templatechange"|switchTextCardTemplate|redirectToTextCardTemplate/)
    assert.equal(JSON.parse(config).component, true)
  }
})

test("the persistent switch respects an active template busy state", async () => {
  const definition = await loadHostDefinition()
  const updates = []
  const context = {
    data: { activeTemplate: "xiaohongshu" },
    selectComponent() {
      return { prepareTemplateSwitch: () => false }
    },
    setData(update) {
      updates.push(update)
    }
  }

  definition.methods.handleTemplateTap.call(context, {
    currentTarget: { dataset: { template: "douyin2" } }
  })

  assert.deepEqual(updates, [])
})

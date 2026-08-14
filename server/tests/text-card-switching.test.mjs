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
  globalThis.Page = (value) => {
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
  const storageUpdates = []
  globalThis.wx = {
    setStorageSync(key, value) {
      storageUpdates.push([key, value])
    }
  }
  const context = {
    data: { activeTemplate: "xiaohongshu" },
    selectComponent() {
      return { prepareTemplateSwitch: () => true }
    },
    setData(update) {
      updates.push(update)
    }
  }

  definition.handleTemplateTap.call(context, {
    currentTarget: { dataset: { template: "douyin3" } }
  })

  assert.deepEqual(updates, [
    {
      activeTemplate: "douyin3",
      "mountedTemplates.douyin3": true
    }
  ])
  assert.deepEqual(storageUpdates, [["TEXT_CARD_LAST_TEMPLATE", "douyin3"]])
  assert.doesNotMatch(
    await readProjectFile("src/pages/text-card/index.ts"),
    /navigateTo|navigateBack|redirectTo/
  )
})

test("text cards use one persistent native switch", async () => {
  const [app, homeModules, homePage, hostTemplate, hostConfig] = await Promise.all([
    readProjectFile("src/app.json"),
    readProjectFile("src/utils/home-modules.js"),
    readProjectFile("src/pages/create/index.ts"),
    readProjectFile("src/pages/text-card/index.wxml"),
    readProjectFile("src/pages/text-card/index.json")
  ])

  const pages = JSON.parse(app).pages
  assert.ok(pages.includes("pages/text-card/index"))
  assert.equal(pages.some((page) => /^pages\/(xiaohongshu|douyin2|douyin3)\//.test(page)), false)
  assert.match(homeModules, /path: "\/pages\/text-card\/index"/)
  assert.match(homePage, /`\$\{String\(path\)\}\?template=\$\{lastTemplate\}`/)
  assert.doesNotMatch(homePage, /`\/pages\/\$\{lastTemplate\}\/index`/)
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
  const templates = [
    "components/text-card-template-one",
    "components/text-card-template-two",
    "components/text-card-template-three"
  ]
  for (const template of templates) {
    const [logic, config] = await Promise.all([
      readProjectFile(`src/${template}/index.ts`),
      readProjectFile(`src/${template}/index.json`)
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

  definition.handleTemplateTap.call(context, {
    currentTarget: { dataset: { template: "douyin2" } }
  })

  assert.deepEqual(updates, [])
})

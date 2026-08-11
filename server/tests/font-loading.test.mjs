import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"
import ts from "typescript"

const projectRoot = new URL("../../", import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

async function createFontLoaderHarness(state) {
  const source = await readProjectFile("src/services/font-loader.ts")
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }).outputText
  const module = { exports: {} }
  const wx = {
    loadFontFace({ source, success }) {
      state.registrationCount += 1
      state.sources.push(source)
      success({ status: "loaded" })
    }
  }
  const context = vm.createContext({
    module,
    exports: module.exports,
    wx,
    setTimeout(callback) {
      queueMicrotask(callback)
      return 1
    },
    clearTimeout() {}
  })
  vm.runInContext(output, context)
  return module.exports
}

test("fonts use one shared lazy loader and one canonical definition each", async () => {
  const [app, config, loader, uiFont, templateOne, templateTwo, templateThree, menuPrint, dayPlan, nginx] =
    await Promise.all([
      readProjectFile("src/app.ts"),
      readProjectFile("src/config/fonts.ts"),
      readProjectFile("src/services/font-loader.ts"),
      readProjectFile("src/services/ui-font.ts"),
      readProjectFile("src/components/text-card-template-one/index.ts"),
      readProjectFile("src/components/text-card-template-two/index.ts"),
      readProjectFile("src/components/text-card-template-three/index.ts"),
      readProjectFile("src/pages/menu/print/index.ts"),
      readProjectFile("src/pages/menu/day-plan/index.ts"),
      readProjectFile("nginx.conf")
    ])

  assert.doesNotMatch(config, /source: `url/)
  assert.doesNotMatch(config, /persistentCache|fileName|version:/)
  assert.match(config, /red3-gb2312\.woff2\?v=20260705/)
  assert.match(loader, /fontLoadPromises = new Map/)
  assert.match(loader, /wx\.loadFontFace/)
  assert.match(loader, /source: `url\("\$\{font\.url\}"\)`/)
  assert.match(loader, /global: true/)
  assert.match(loader, /scopes: \["webview", "native"\]/)
  assert.doesNotMatch(loader, /downloadFile|getFileSystemManager|USER_DATA_PATH/)
  assert.doesNotMatch(loader, /getStorageSync|setStorageSync|removeStorageSync/)
  assert.doesNotMatch(loader, /base64|persistentCache|forceRegister/)

  for (const consumer of [uiFont, templateOne, templateTwo, templateThree, menuPrint]) {
    assert.doesNotMatch(consumer, /wx\.loadFontFace/)
    assert.match(consumer, /loadAppFont/)
  }

  assert.doesNotMatch(dayPlan, /wx\.loadFontFace/)
  assert.match(dayPlan, /initializeUIFont/)

  assert.match(uiFont, /APP_FONTS\.ui|UI_FONT/)
  assert.match(app, /preloadRed3Font\(\)/)
  assert.match(app, /setTimeout\(preloadRed3Font, RED3_PRELOAD_RETRY_DELAY\)/)
  assert.match(templateOne, /APP_FONTS\.red3/)
  assert.match(templateOne, /loadAppFont\(APP_FONTS\.red3\)/)
  assert.doesNotMatch(templateOne, /forceRegister|timeoutMs: 0/)
  assert.match(templateTwo, /APP_FONTS\.ui/)
  assert.match(templateThree, /APP_FONTS\.lantingExtraLight/)
  assert.match(menuPrint, /APP_FONTS\.ui/)
  assert.match(menuPrint, /APP_FONTS\.lantingSemibold/)
  assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/)
})

test("font loader uses the official HTTPS source and only merges duplicate runtime calls", async () => {
  const state = {
    registrationCount: 0,
    sources: []
  }
  const font = {
    family: "TestFont",
    name: "测试字体",
    url: "https://example.com/test.woff2?v=1",
    weight: "normal"
  }

  const firstRuntime = await createFontLoaderHarness(state)
  await Promise.all([
    firstRuntime.loadAppFont(font),
    firstRuntime.loadAppFont(font)
  ])
  assert.equal(state.registrationCount, 1)
  assert.deepEqual(state.sources, ['url("https://example.com/test.woff2?v=1")'])

  const secondRuntime = await createFontLoaderHarness(state)
  await secondRuntime.loadAppFont(font)
  assert.equal(state.registrationCount, 2)
  assert.equal(state.sources[1], 'url("https://example.com/test.woff2?v=1")')
})

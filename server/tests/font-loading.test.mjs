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
    env: { USER_DATA_PATH: "/font-cache" },
    getStorageSync(key) {
      return state.storage.get(key)
    },
    setStorageSync(key, value) {
      state.storage.set(key, value)
    },
    removeStorageSync(key) {
      state.storage.delete(key)
    },
    getFileSystemManager() {
      return {
        access({ path, success, fail }) {
          state.files.has(path) ? success() : fail({ errMsg: "missing" })
        },
        readFile({ filePath, success, fail }) {
          state.readCount += 1
          state.files.has(filePath)
            ? success({ data: "d09GMgAAAAA=" })
            : fail({ errMsg: "missing" })
        },
        saveFile({ filePath, success }) {
          state.files.add(filePath)
          success({ savedFilePath: filePath })
        },
        unlink({ filePath, success }) {
          state.files.delete(filePath)
          success()
        }
      }
    },
    downloadFile({ success }) {
      state.downloadCount += 1
      success({ statusCode: 200, tempFilePath: "/tmp/font.woff2" })
    },
    loadFontFace({ success }) {
      state.registrationCount += 1
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
  assert.doesNotMatch(config, /persistentCache\?:/)
  assert.equal(config.match(/fileName:/g)?.length, 5)
  assert.match(config, /fileName: "fangzhengboyafangkansong\.woff2"/)
  assert.match(config, /fileName: "red3-gb2312\.woff2"/)
  assert.match(config, /fileName: "FZLTHProGlobal-Extralight\.woff2"/)
  assert.match(config, /fileName: "FZLTHProGlobal-Semibold\.woff2"/)
  assert.match(loader, /cachedFontFilePromises = new Map/)
  assert.match(loader, /cachedFontSourcePromises = new Map/)
  assert.match(loader, /fontRegistrationPromises = new Map/)
  assert.match(loader, /getSharedPromise/)
  assert.match(loader, /fileExists/)
  assert.match(loader, /wx\.loadFontFace/)
  assert.match(loader, /wx\.downloadFile/)
  assert.match(loader, /wx\.env\.USER_DATA_PATH/)
  assert.match(loader, /encoding: "base64"/)
  assert.match(loader, /data:font\/woff2;base64/)
  assert.match(loader, /getPersistentFontSource/)
  assert.match(loader, /DEFAULT_FONT_LOAD_TIMEOUT/)
  assert.match(loader, /FontLoadTimeoutError/)
  assert.match(loader, /timeoutMs = options\.timeoutMs \?\? DEFAULT_FONT_LOAD_TIMEOUT/)
  assert.match(loader, /cachedPromise && !options\.forceRegister/)
  assert.doesNotMatch(loader, /font\.source|usePersistentCache/)

  for (const consumer of [uiFont, templateOne, templateTwo, templateThree, menuPrint]) {
    assert.doesNotMatch(consumer, /wx\.loadFontFace/)
    assert.match(consumer, /loadAppFont/)
  }

  assert.doesNotMatch(dayPlan, /wx\.loadFontFace/)
  assert.match(dayPlan, /initializeUIFont/)

  assert.match(uiFont, /APP_FONTS\.ui|UI_FONT/)
  assert.match(app, /preloadRed3Font\(\)/)
  assert.match(app, /setTimeout\(\(\) => preloadRed3Font\(true\)/)
  assert.match(templateOne, /APP_FONTS\.red3/)
  assert.match(templateOne, /loadAppFont\(APP_FONTS\.red3, \{ timeoutMs: 0 \}\)/)
  assert.match(templateTwo, /APP_FONTS\.ui/)
  assert.match(templateThree, /APP_FONTS\.lantingExtraLight/)
  assert.match(menuPrint, /APP_FONTS\.ui/)
  assert.match(menuPrint, /APP_FONTS\.lantingSemibold/)
  assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/)
})

test("font cache shares download and read work, then survives a new runtime", async () => {
  const state = {
    storage: new Map(),
    files: new Set(),
    downloadCount: 0,
    readCount: 0,
    registrationCount: 0
  }
  const font = {
    family: "TestFont",
    name: "测试字体",
    url: "https://example.com/test.woff2?v=1",
    weight: "normal",
    persistentCache: {
      fileName: "test.woff2",
      version: "1"
    }
  }

  const firstRuntime = await createFontLoaderHarness(state)
  await Promise.all([
    firstRuntime.loadAppFont(font, { timeoutMs: 0 }),
    firstRuntime.loadAppFont(font, { timeoutMs: 0 })
  ])
  assert.equal(state.downloadCount, 1)
  assert.equal(state.readCount, 1)
  assert.equal(state.registrationCount, 1)

  await firstRuntime.loadAppFont(font, {
    timeoutMs: 0,
    forceRegister: true
  })
  assert.equal(state.downloadCount, 1)
  assert.equal(state.readCount, 1)
  assert.equal(state.registrationCount, 2)

  const secondRuntime = await createFontLoaderHarness(state)
  await secondRuntime.loadAppFont(font, { timeoutMs: 0 })
  assert.equal(state.downloadCount, 1)
  assert.equal(state.readCount, 2)
  assert.equal(state.registrationCount, 3)
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
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

  assert.equal(config.match(/source: `url/g)?.length, 4)
  assert.equal(config.match(/persistentCache:/g)?.length, 1)
  assert.match(config, /fileName: "red3-gb2312\.woff2"/)
  assert.match(config, /version: "20260705"/)
  assert.match(loader, /fontPromises = new Map/)
  assert.match(loader, /wx\.loadFontFace/)
  assert.match(loader, /wx\.downloadFile/)
  assert.match(loader, /wx\.env\.USER_DATA_PATH/)
  assert.match(loader, /encoding: "base64"/)
  assert.match(loader, /data:font\/woff2;base64/)
  assert.match(loader, /getPersistentFontSource/)
  assert.match(loader, /DEFAULT_FONT_LOAD_TIMEOUT/)
  assert.match(loader, /FontLoadTimeoutError/)
  assert.match(loader, /timeoutMs = options\.timeoutMs \?\? DEFAULT_FONT_LOAD_TIMEOUT/)
  assert.match(loader, /cachedPromise && !options\.forceReload/)
  assert.match(loader, /options\.usePersistentCache !== false/)
  assert.match(loader, /if \(!\(error instanceof FontLoadTimeoutError\)\)/)

  for (const consumer of [uiFont, templateOne, templateTwo, templateThree, menuPrint]) {
    assert.doesNotMatch(consumer, /wx\.loadFontFace/)
    assert.match(consumer, /loadAppFont/)
  }

  assert.doesNotMatch(dayPlan, /wx\.loadFontFace/)
  assert.match(dayPlan, /initializeUIFont/)

  assert.match(uiFont, /APP_FONTS\.ui|UI_FONT/)
  assert.match(app, /loadAppFont\(APP_FONTS\.red3, \{ timeoutMs: 0 \}\)/)
  assert.match(templateOne, /APP_FONTS\.red3/)
  assert.match(templateOne, /loadAppFont\(APP_FONTS\.red3, \{ timeoutMs: 0 \}\)/)
  assert.match(templateTwo, /APP_FONTS\.ui/)
  assert.match(templateThree, /APP_FONTS\.lantingExtraLight/)
  assert.match(menuPrint, /APP_FONTS\.ui/)
  assert.match(menuPrint, /APP_FONTS\.lantingSemibold/)
  assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/)
})

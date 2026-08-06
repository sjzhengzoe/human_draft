import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

test("fonts use one shared lazy loader and one canonical definition each", async () => {
  const [config, loader, uiFont, templateOne, templateTwo, templateThree, menuPrint, nginx] =
    await Promise.all([
      readProjectFile("src/config/fonts.ts"),
      readProjectFile("src/services/font-loader.ts"),
      readProjectFile("src/services/ui-font.ts"),
      readProjectFile("src/pages/xiaohongshu/index.ts"),
      readProjectFile("src/pages/douyin2/index.ts"),
      readProjectFile("src/pages/douyin3/index.ts"),
      readProjectFile("src/pages/menu/print/index.ts"),
      readProjectFile("nginx.conf")
    ])

  assert.equal(config.match(/source: `url/g)?.length, 4)
  assert.match(loader, /fontPromises = new Map/)
  assert.match(loader, /wx\.loadFontFace/)

  for (const consumer of [uiFont, templateOne, templateTwo, templateThree, menuPrint]) {
    assert.doesNotMatch(consumer, /wx\.loadFontFace/)
    assert.match(consumer, /loadAppFont/)
  }

  assert.match(uiFont, /APP_FONTS\.ui|UI_FONT/)
  assert.match(templateOne, /APP_FONTS\.red3/)
  assert.match(templateTwo, /APP_FONTS\.ui/)
  assert.match(templateThree, /APP_FONTS\.lantingExtraLight/)
  assert.match(menuPrint, /APP_FONTS\.ui/)
  assert.match(menuPrint, /APP_FONTS\.lantingSemibold/)
  assert.match(nginx, /Cache-Control "public, max-age=31536000, immutable"/)
})

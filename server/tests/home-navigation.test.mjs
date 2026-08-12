import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

test("locked home modules resume their validated destination after login", async () => {
  const [homePage, loginPage, homeModules] = await Promise.all([
    readFile(new URL("src/pages/create/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/login/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/utils/home-modules.js", projectRoot), "utf8")
  ])

  assert.match(homePage, /pendingLoginModuleKey/)
  assert.match(homePage, /module=\$\{encodeURIComponent\(moduleKey\)\}/)
  assert.match(loginPage, /getHomeModulePath\(moduleKey\)/)
  assert.match(loginPage, /wx\.redirectTo\(\{[\s\S]*?url: targetPath/)
  assert.match(loginPage, /recordHomeModuleUsed\(homeModuleKey\)/)
  assert.match(homeModules, /function getHomeModulePath\(key\)/)
})

test("home navigation ignores repeated taps and only refreshes changed state", async () => {
  const homePage = await readFile(
    new URL("src/pages/create/index.ts", projectRoot),
    "utf8"
  )

  assert.match(homePage, /if \(page\.navigationLocked\) return/)
  assert.match(homePage, /page\.navigationLocked = true/)
  assert.match(homePage, /fail: \(\) => \{[\s\S]*?page\.navigationLocked = false/)
  assert.match(homePage, /if \(Object\.keys\(updates\)\.length > 0\) this\.setData\(updates\)/)
})

test("signed-out home cards keep their artwork visible behind a compact lock", async () => {
  const styles = await readFile(
    new URL("src/pages/create/index.less", projectRoot),
    "utf8"
  )
  const overlayBlock = styles.match(/\.feature-item__login-overlay\s*\{([\s\S]*?)\}/)?.[1] || ""

  assert.match(overlayBlock, /top: 12rpx/)
  assert.match(overlayBlock, /right: 12rpx/)
  assert.doesNotMatch(overlayBlock, /inset: 0|background:/)
})

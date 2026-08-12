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
  assert.match(homeModules, /function getHomeModulePath\(key\)/)
})

test("home page does not render or record recently used modules", async () => {
  const [homePage, homeMarkup, homeStyles, homeModules] = await Promise.all([
    readFile(new URL("src/pages/create/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.less", projectRoot), "utf8"),
    readFile(new URL("src/utils/home-modules.js", projectRoot), "utf8")
  ])

  for (const source of [homePage, homeMarkup, homeStyles, homeModules]) {
    assert.doesNotMatch(
      source,
      /recentItems|recent-section|recordHomeModuleUsed|RECENT_HOME_MODULE_KEYS/
    )
  }
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

test("login dialog navigation unlocks and reports a navigation failure", async () => {
  const homePage = await readFile(
    new URL("src/pages/create/index.ts", projectRoot),
    "utf8"
  )
  const confirmHandler = homePage.match(
    /handleLoginDialogConfirm\(\) \{([\s\S]*?)\n    \}\n  \}/
  )?.[1] || ""

  assert.match(confirmHandler, /if \(page\.navigationLocked\) return/)
  assert.match(confirmHandler, /page\.navigationLocked = true/)
  assert.match(confirmHandler, /fail: \(\) => \{[\s\S]*?page\.navigationLocked = false/)
  assert.match(confirmHandler, /wx\.showToast\(\{ title: "暂时无法打开，请重试", icon: "none" \}\)/)
})

test("visible home module groups are reused while module visibility is unchanged", async () => {
  const homeModules = await readFile(
    new URL("src/utils/home-modules.js", projectRoot),
    "utf8"
  )

  assert.match(homeModules, /let visibleHomeFeatureGroupsCache = null/)
  assert.match(homeModules, /signature === visibleHomeFeatureGroupsSignature/)
  assert.match(homeModules, /return visibleHomeFeatureGroupsCache/)
  assert.match(homeModules, /visibleHomeFeatureGroupsCache = HOME_FEATURE_GROUPS/)
})

test("signed-out home cards defer login guidance until a protected module is tapped", async () => {
  const [markup, styles, logic] = await Promise.all([
    readFile(new URL("src/pages/create/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.ts", projectRoot), "utf8")
  ])

  assert.doesNotMatch(markup, /feature-item__login-overlay|lock-keyhole/)
  assert.doesNotMatch(styles, /feature-item__login-(?:overlay|lock)/)
  assert.match(logic, /if \(needsLogin && !getCurrentUser\(\)\)/)
  assert.match(logic, /loginDialogVisible: true/)
})

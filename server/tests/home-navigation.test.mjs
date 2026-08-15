import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

test("home modules open before login and action login returns to the current page", async () => {
  const [homePage, loginPage, homeModules] = await Promise.all([
    readFile(new URL("src/pages/create/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/pages/login/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/utils/home-modules.js", projectRoot), "utf8")
  ])

  assert.doesNotMatch(homePage, /pendingLoginModuleKey|requiresLogin|loginDialogVisible/)
  assert.match(homePage, /wx\.navigateTo\(\{[\s\S]*?url: nextPath/)
  assert.match(loginPage, /returnAfterLogin/)
  assert.match(loginPage, /wx\.navigateBack\(\{/)
  assert.doesNotMatch(homeModules, /requiresLogin/)
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

test("shared login dialog returns to the current feature after login", async () => {
  const dialog = await readFile(
    new URL("src/components/login-required-dialog/index.ts", projectRoot),
    "utf8"
  )

  assert.match(dialog, /if \(this\.data\.navigating\) return/)
  assert.match(dialog, /url: "\/pages\/login\/index\?return=1"/)
  assert.match(dialog, /fail: \(\) => \{[\s\S]*?navigating: false/)
  assert.match(dialog, /wx\.showToast\(\{ title: "暂时无法打开，请重试", icon: "none" \}\)/)
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

test("signed-out home cards open directly and actions own the gentle login prompt", async () => {
  const [markup, styles, logic, dialogMarkup, loginGuard] = await Promise.all([
    readFile(new URL("src/pages/create/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.less", projectRoot), "utf8"),
    readFile(new URL("src/pages/create/index.ts", projectRoot), "utf8"),
    readFile(new URL("src/components/login-required-dialog/index.wxml", projectRoot), "utf8"),
    readFile(new URL("src/utils/login-required.ts", projectRoot), "utf8")
  ])

  assert.doesNotMatch(markup, /feature-item__login-overlay|lock-keyhole/)
  assert.doesNotMatch(styles, /feature-item__login-(?:overlay|lock)/)
  assert.doesNotMatch(logic, /getCurrentUser|loginDialogVisible|needsLogin/)
  assert.match(dialogMarkup, /title="登录后继续"/)
  assert.match(dialogMarkup, /content="这样你的记录就不会走丢啦 \(｡•ᴗ•｡\)"/)
  assert.match(loginGuard, /if \(getCurrentUser\(\)\) return true/)
  assert.match(loginGuard, /#login-required-dialog/)
})

test("personal feature pages render a guest state before requesting private data", async () => {
  const paths = [
    "src/pages/menu/index.ts",
    "src/pages/media/index.ts",
    "src/pages/activities/index.ts",
    "src/pages/chat-topics/index.ts",
    "src/exercise/pages/index.ts",
    "src/pages/luggage/index.ts",
    "src/pages/wardrobe/index.ts",
    "src/pages/key-moments/index.ts",
  ]

  for (const path of paths) {
    const source = await readFile(new URL(path, projectRoot), "utf8")
    assert.match(source, /if \(!getCurrentUser\(\)\)/, `${path} must guard guest loading`)
    assert.match(source, /requireLoginForAction\(this\)/, `${path} must defer login to an action`)
  }

  const footprint = await readFile(
    new URL("src/pages/footprint/index.ts", projectRoot),
    "utf8"
  )
  assert.match(footprint, /if \(getCurrentUser\(\)\) void this\.loadCloudFootprint\(\)/)
  assert.match(footprint, /handleCityTap[\s\S]*?requireLoginForAction\(this\)/)
})

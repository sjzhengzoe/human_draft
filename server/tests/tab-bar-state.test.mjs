import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("tab pages update only changed bottom-navigation fields", async () => {
  const [helper, homePage, settingsPage] = await Promise.all([
    readFile(new URL("../../src/utils/tab-bar.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/create/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8")
  ])

  assert.match(helper, /nextState\.selected !== tabBar\.data\.selected/)
  assert.match(helper, /nextState\.hidden !== tabBar\.data\.hidden/)
  assert.match(helper, /nextState\.masked !== tabBar\.data\.masked/)
  assert.match(helper, /if \(Object\.keys\(updates\)\.length > 0\) tabBar\.setData\(updates\)/)
  assert.match(homePage, /updateAppTabBarState\(tabBar, \{[\s\S]*?selected: 0[\s\S]*?masked: false/)
  assert.match(settingsPage, /updateAppTabBarState\(tabBar, \{ selected: 1, hidden: false \}\)/)
})

test("bottom navigation ignores repeated switches until the current switch finishes", async () => {
  const tabBar = await readFile(
    new URL("../../src/custom-tab-bar/index.ts", import.meta.url),
    "utf8"
  )

  assert.match(tabBar, /switching\?: boolean/)
  assert.match(tabBar, /if \(!tab \|\| index === this\.data\.selected \|\| tabBar\.switching\) return/)
  assert.match(tabBar, /tabBar\.switching = true[\s\S]*?wx\.switchTab/)
  assert.match(tabBar, /complete: \(\) => \{[\s\S]*?tabBar\.switching = false/)
})

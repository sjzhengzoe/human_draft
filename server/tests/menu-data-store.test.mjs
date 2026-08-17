import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8")

test("menu pages share module data until a write changes its revision", async () => {
  const [store, menuPage, placePage, printPage, menuService, authService] = await Promise.all([
    read("src/utils/menu-data-store.ts"),
    read("src/pages/menu/index.ts"),
    read("src/pages/menu/place/index.ts"),
    read("src/pages/menu/print/index.ts"),
    read("src/services/menu.ts"),
    read("src/services/auth.ts")
  ])

  assert.match(store, /let store: MenuDataStore \| null = null/)
  assert.match(store, /store\.userId === userId && store\.revision === revision/)
  assert.match(store, /contentByFilter: Map/)
  assert.match(menuPage, /restoreMenuDataFromStore/)
  assert.match(menuPage, /cacheMenuContent/)
  assert.doesNotMatch(menuPage, /onUnload\(\)[\s\S]*?clearMenuDataStore\(\)/)
  assert.match(placePage, /getCachedMenuPlace/)
  assert.match(printPage, /getCachedMenuContent/)
  assert.match(menuService, /markMenuDataChanged\(\)/)
  assert.match(authService, /clearMenuDataStore\(\)/)
})

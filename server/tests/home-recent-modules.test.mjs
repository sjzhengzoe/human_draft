import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import vm from "node:vm"

const projectRoot = new URL("../../", import.meta.url)

async function createHomeModuleHarness() {
  const source = await readFile(new URL("src/utils/home-modules.js", projectRoot), "utf8")
  const storage = new Map()
  const module = { exports: {} }
  const context = vm.createContext({
    module,
    exports: module.exports,
    wx: {
      getStorageSync(key) {
        return storage.get(key)
      },
      setStorageSync(key, value) {
        storage.set(key, value)
      },
      removeStorageSync(key) {
        storage.delete(key)
      }
    }
  })
  vm.runInContext(source, context)
  return module.exports
}

test("recent home modules retain the two latest valid destinations", async () => {
  const homeModules = await createHomeModuleHarness()

  homeModules.recordHomeModuleUsed("menu")
  homeModules.recordHomeModuleUsed("media")
  homeModules.recordHomeModuleUsed("menu")
  homeModules.recordHomeModuleUsed("unknown")

  const recentKeys = JSON.parse(JSON.stringify(
    homeModules.getRecentHomeFeatureItems().map((item) => item.key)
  ))
  assert.deepEqual(recentKeys, ["menu", "media"])
})

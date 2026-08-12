import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

test("home feature pages stay reachable while loading outside the main package", async () => {
  const [appSource, homeModuleSource] = await Promise.all([
    readFile(new URL("src/app.json", projectRoot), "utf8"),
    readFile(new URL("src/utils/home-modules.js", projectRoot), "utf8")
  ])
  const app = JSON.parse(appSource)
  const expectedRoots = [
    "pages/menu",
    "pages/media",
    "pages/key-moments",
    "pages/footprint",
    "pages/chat-topics",
    "pages/activities",
    "pages/luggage",
    "pages/wardrobe"
  ]
  const registeredPages = [
    ...app.pages,
    ...app.subPackages.flatMap((subPackage) =>
      subPackage.pages.map((page) => `${subPackage.root}/${page}`)
    )
  ]
  const homePaths = [...homeModuleSource.matchAll(/path: "(\/[^"?]+)"/g)]
    .map((match) => match[1].slice(1))

  for (const root of expectedRoots) {
    assert.ok(app.subPackages.some((subPackage) => subPackage.root === root))
    assert.equal(app.pages.some((page) => page.startsWith(`${root}/`)), false)
  }
  for (const homePath of homePaths) {
    assert.ok(registeredPages.includes(homePath), `${homePath} should remain registered`)
  }
})

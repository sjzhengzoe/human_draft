import assert from "node:assert/strict"
import { access, readFile, readdir } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

async function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

test("server entry only starts the app and application assembly stays compact", async () => {
  const [entry, app] = await Promise.all([
    readProjectFile("server/index.mjs"),
    readProjectFile("server/app.mjs")
  ])

  assert.ok(entry.split("\n").length <= 40)
  assert.ok(app.split("\n").length <= 100)
  assert.match(entry, /buildServer/)
  assert.match(app, /routeRegistrars/)
  assert.match(app, /registerErrorHandlers/)
})

test("life-list routes depend on domain services instead of a flat compatibility module", async () => {
  const domains = ["activities", "dining", "luggage", "media"]
  const routeSources = await Promise.all(
    domains.map((domain) => readProjectFile(`server/routes/${domain}.mjs`))
  )

  domains.forEach((domain, index) => {
    assert.match(routeSources[index], new RegExp(`domains/${domain}/service\\.mjs`))
  })

  await assert.rejects(access(new URL("server/lib/life-lists.mjs", projectRoot)))

  const sharedRecords = await readProjectFile("server/domains/shared/records.mjs")
  assert.match(sharedRecords, /export function requiredText/)
  assert.match(sharedRecords, /export async function requireRecord/)
  assert.match(sharedRecords, /export async function nextSortOrder/)
})

test("client services and types follow the same domain boundaries", async () => {
  const domains = ["activities", "dining", "luggage", "media"]
  const [services, types] = await Promise.all([
    Promise.all(domains.map((domain) => readProjectFile(`src/services/${domain}.ts`))),
    Promise.all(domains.map((domain) => readProjectFile(`src/types/${domain}.ts`)))
  ])

  domains.forEach((domain, index) => {
    assert.match(services[index], new RegExp(`types/${domain}`))
    assert.match(types[index], /export type/)
  })

  await Promise.all([
    assert.rejects(access(new URL("src/services/life-lists.ts", projectRoot))),
    assert.rejects(access(new URL("src/types/life-lists.ts", projectRoot)))
  ])
})

test("server lib contains infrastructure only", async () => {
  const files = await readdir(new URL("server/lib/", projectRoot))
  assert.deepEqual(files.sort(), [
    "cos-storage.mjs",
    "errors.mjs",
    "image-processing.mjs",
    "supabase.mjs",
    "wechat-content-security.mjs"
  ])
})

test("server tests stay in the dedicated tests directory", async () => {
  const [serverFiles, testFiles] = await Promise.all([
    readdir(new URL("server/", projectRoot)),
    readdir(new URL("server/tests/", projectRoot))
  ])

  assert.equal(serverFiles.some((file) => file.endsWith(".test.mjs")), false)
  assert.ok(testFiles.length > 0)
  assert.equal(testFiles.every((file) => file.endsWith(".test.mjs")), true)
})

test("image upload parsing and storage transactions are shared without cross-domain imports", async () => {
  const [menuRoutes, wardrobeRoutes, keyMoments, sharedStorage, multipart] =
    await Promise.all([
      readProjectFile("server/routes/menu.mjs"),
      readProjectFile("server/routes/wardrobe.mjs"),
      readProjectFile("server/domains/key-moments/service.mjs"),
      readProjectFile("server/domains/shared/image-storage.mjs"),
      readProjectFile("server/http/multipart-image.mjs")
    ])

  assert.match(menuRoutes, /http\/multipart-image\.mjs/)
  assert.match(wardrobeRoutes, /http\/multipart-image\.mjs/)
  assert.doesNotMatch(wardrobeRoutes, /domains\/menu/)
  assert.match(keyMoments, /shared\/image-storage\.mjs/)
  assert.match(sharedStorage, /export async function uploadStandardImage/)
  assert.doesNotMatch(sharedStorage, /uploadOptimizedImagePair|THUMBNAIL_UPLOAD_FAILED/)
  assert.match(sharedStorage, /export async function createSignedUrlMap/)
  assert.match(multipart, /export async function readMultipartImage/)
})

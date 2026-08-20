import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const sortablePages = [
  "src/pages/media/categories/index.wxml",
  "src/pages/media/season-manage/index.wxml",
  "src/pages/wardrobe/categories/index.wxml",
  "src/pages/wardrobe/category-edit/index.wxml",
  "src/pages/activities/manage/index.wxml",
  "src/pages/menu/favorites/index.wxml",
  "src/pages/menu/index.wxml",
  "src/pages/luggage/scenes/index.wxml",
  "src/pages/luggage/index.wxml",
]

test("list sorting uses the shared long-press drag interaction", async () => {
  const [utility, ghostPage, appConfig, ...pages] = await Promise.all([
    readFile("src/utils/drag-sort.ts", "utf8"),
    readFile("src/components/sort-drag-ghost/index.wxml", "utf8"),
    readFile("src/app.json", "utf8"),
    ...sortablePages.map((path) => readFile(path, "utf8")),
  ])

  assert.match(utility, /export function createDragSortController/)
  assert.match(utility, /export function dragSortPreviewStyles/)
  assert.match(utility, /destinationRect\.left - sourceRect\.left/)
  assert.match(utility, /destinationRect\.top - sourceRect\.top/)
  assert.match(utility, /function finish<T>/)
  assert.match(ghostPage, /name="drag-handle" size="27"/)
  assert.equal(
    JSON.parse(appConfig).usingComponents["sort-drag-ghost"],
    "/components/sort-drag-ghost/index",
  )

  pages.forEach((page, index) => {
    const path = sortablePages[index]
    assert.match(page, /name="drag-handle"/, `${path} must show the shared three-line handle`)
    assert.match(page, /catchlongpress=/, `${path} must start sorting with a long press`)
    assert.match(page, /catchtouchmove=/, `${path} must preview sorting while moving`)
    assert.match(page, /<sort-drag-ghost/, `${path} must show the shared drag preview`)
    assert.doesNotMatch(page, /aria-label="(?:上移|下移|向上移动|向下移动)/, `${path} must not expose arrow-based sorting`)
  })
})

test("key-moment images keep their original handle-free image dragging", async () => {
  const page = await readFile("src/pages/key-moments/edit/index.wxml", "utf8")

  assert.match(page, /class="image-grid__item[^\"]*"[\s\S]*?catchlongpress="handleImageLongPress"/)
  assert.match(page, /catchtouchmove="handleImageTouchMove"/)
  assert.doesNotMatch(page, /drag-handle/)
})

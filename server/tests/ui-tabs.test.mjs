import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

const tabSelectors = new Map([
  ["src/pages/media/index.less", [
    ".view-switch__item--active",
    ".category-chip--active"
  ]],
  ["src/pages/media/detail/index.less", [
    ".detail-tab--active",
    ".season-tab--active",
    ".timeline-filter-option--active"
  ]],
  ["src/pages/media/episode-edit/index.less", [
    ".timeline-type-option--active"
  ]],
  ["src/pages/menu/index.less", [
    ".view-switch__item--active",
    ".record-filter__item--active",
    ".category-chip--active"
  ]],
  ["src/pages/menu/print/index.less", [
    ".print-status-filter__item--active",
    ".category-chip--active"
  ]],
  ["src/pages/chat-topics/index.less", [".topic-tab--active"]],
  ["src/pages/activities/index.less", [".activity-type-switch__item--active"]],
  ["src/pages/activities/edit/index.less", [".type-option--active"]],
  ["src/pages/footprint/index.less", [
    ".map-level-switch__button--active",
    ".province-tabs__button--active"
  ]],
  ["src/pages/key-moments/index.less", [".granularity-tab--active"]],
  ["src/pages/wardrobe/index.less", [".category-tab--active"]],
  ["src/pages/text-card/index.less", [".template-switch__item--active"]]
])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

test("module tabs use the shared black selected state", async () => {
  for (const [path, selectors] of tabSelectors) {
    const styles = await readFile(new URL(path, projectRoot), "utf8")
    for (const selector of selectors) {
      const block = styles.match(new RegExp(`${escapeRegExp(selector)}\\s*\\{([^}]*)\\}`))?.[1]
      assert.ok(block, `${path} must define ${selector}`)
      assert.match(block, /background:\s*var\(--ui-color-action-primary\);/)
      assert.match(block, /color:\s*var\(--ui-color-text-inverse\);/)
    }
  }
})

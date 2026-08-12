import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)
const sourceRoot = new URL("src/", projectRoot)
const colorLiteralPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory)
    if (entry.isDirectory()) return listFiles(target)
    return [target]
  }))
  return nested.flat()
}

test("business UI consumes the centralized color tokens", async () => {
  const files = await listFiles(sourceRoot)
  const colorDefinitionPaths = new Set([
    "/src/styles/colors.less",
    "/src/styles/colors.ts"
  ])
  const checkedExtensions = new Set([".less", ".ts", ".wxml", ".wxss"])
  const violations = []

  for (const file of files) {
    const relativePath = file.pathname.slice(projectRoot.pathname.length - 1)
    const extension = relativePath.slice(relativePath.lastIndexOf("."))
    if (!checkedExtensions.has(extension) || colorDefinitionPaths.has(relativePath)) continue
    const source = await readFile(file, "utf8")
    const literals = source.match(colorLiteralPattern)
    if (literals?.length) violations.push(`${relativePath}: ${literals.join(", ")}`)
    if ((extension === ".less" || extension === ".wxss") && source.includes("var(--color-")) {
      violations.push(`${relativePath}: business styles must use semantic variables`)
    }
  }

  assert.deepEqual(violations, [])
})

test("the app imports the shared color palette", async () => {
  const [appStyles, colors] = await Promise.all([
    readFile(new URL("src/app.less", projectRoot), "utf8"),
    readFile(new URL("src/styles/colors.less", projectRoot), "utf8")
  ])

  assert.match(appStyles, /@import "\.\/styles\/colors\.less";/)
  for (const token of [
    "--ui-color-text-primary",
    "--ui-color-text-muted",
    "--ui-color-action-primary",
    "--ui-color-background-page",
    "--ui-color-border",
    "--ui-color-danger",
    "--footprint-color-background",
    "--meal-plan-color-breakfast",
    "--media-color-rating"
  ]) {
    assert.match(colors, new RegExp(`${token}:`))
  }
})

test("runtime UI constants stay aligned with the CSS palette", async () => {
  const [styles, runtime] = await Promise.all([
    readFile(new URL("src/styles/colors.less", projectRoot), "utf8"),
    readFile(new URL("src/styles/colors.ts", projectRoot), "utf8")
  ])
  const cssValues = new Map(
    [...styles.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)]
      .map((match) => [match[1], match[2]])
  )
  const runtimeBlock = runtime.match(/export const UI_COLORS = \{([\s\S]*?)\} as const/)?.[1] || ""
  const runtimeValues = new Map(
    [...runtimeBlock.matchAll(/([a-zA-Z]+):\s*"([^"]+)"/g)]
      .map((match) => [match[1], match[2]])
  )
  const sharedTokens = [
    ["--color-neutral-25", "surface"],
    ["--color-neutral-50", "pageBackground"],
    ["--color-neutral-950", "textPrimary"],
    ["--color-neutral-500", "textMuted"],
    ["--color-black", "actionPrimary"],
    ["--ui-color-shadow", "shadow"],
    ["--ui-color-danger", "danger"],
    ["--ui-color-overlay-soft", "overlaySoft"]
  ]

  for (const [cssToken, runtimeKey] of sharedTokens) {
    assert.equal(runtimeValues.get(runtimeKey), cssValues.get(cssToken), `${runtimeKey} must match ${cssToken}`)
  }

  assert.deepEqual(
    Object.fromEntries(
      ["pageBackground", "surface", "actionPrimary"].map((key) => [key, runtimeValues.get(key)])
    ),
    {
      pageBackground: "#f6f7f1",
      surface: "#fbfcf8",
      actionPrimary: "#000000"
    }
  )
})

test("mini program JSON colors stay within the documented configuration exceptions", async () => {
  const files = await listFiles(sourceRoot)
  const runtime = await readFile(new URL("src/styles/colors.ts", projectRoot), "utf8")
  const uiColorBlock = runtime.match(/export const UI_COLORS = \{([\s\S]*?)\} as const/)?.[1] || ""
  const allowed = new Set(uiColorBlock.match(colorLiteralPattern)?.map((color) => color.toLowerCase()))
  const violations = []

  for (const file of files.filter((entry) => entry.pathname.endsWith(".json"))) {
    const source = await readFile(file, "utf8")
    for (const color of source.match(colorLiteralPattern) || []) {
      if (!allowed.has(color.toLowerCase())) {
        const relativePath = file.pathname.slice(projectRoot.pathname.length - 1)
        violations.push(`${relativePath}: ${color}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

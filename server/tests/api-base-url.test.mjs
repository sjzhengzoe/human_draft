import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

test("developer tools use the production API unless local backend testing is explicitly enabled", async () => {
  const source = await readFile(new URL("src/config/env.ts", projectRoot), "utf8")

  assert.match(source, /const DEVELOPMENT_API_BASE_URL = ""/)
  assert.match(
    source,
    /getEnvVersion\(\) === "develop" && isDevTools\(\) && DEVELOPMENT_API_BASE_URL[\s\S]*?\? DEVELOPMENT_API_BASE_URL[\s\S]*?: PRODUCTION_API_BASE_URL/
  )
})

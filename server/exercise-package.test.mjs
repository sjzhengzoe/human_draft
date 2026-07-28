import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("exercise pets and bowls are shipped in the exercise subpackage", async () => {
  const appConfig = JSON.parse(
    await readFile(new URL("src/app.json", projectRoot), "utf8"),
  );
  const projectConfig = JSON.parse(
    await readFile(new URL("project.config.json", projectRoot), "utf8"),
  );
  const pageSource = await readFile(
    new URL("src/exercise/pages/index.ts", projectRoot),
    "utf8",
  );

  assert.equal(appConfig.pages.includes("pages/exercise/index"), false);
  assert.deepEqual(
    appConfig.subPackages.find((item) => item.root === "exercise")?.pages,
    ["pages/index", "pages/settings/index"],
  );
  assert.equal(projectConfig.setting.ignoreUploadUnusedFiles, false);
  assert.ok(
    projectConfig.packOptions.include.some(
      (item) => item.type === "folder" && item.value === "exercise/assets",
    ),
  );

  const imagePaths = [...pageSource.matchAll(/"(\/exercise\/assets\/[^"]+\.webp)"/g)]
    .map((match) => match[1]);
  assert.equal(imagePaths.length, 40);
  await Promise.all(
    imagePaths.map((imagePath) =>
      access(new URL(`src${imagePath}`, projectRoot)),
    ),
  );
});

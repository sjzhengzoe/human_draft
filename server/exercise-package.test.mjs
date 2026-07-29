import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("exercise pets and bowls are served remotely instead of shipped in the package", async () => {
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
  assert.equal(projectConfig.setting.ignoreUploadUnusedFiles, true);
  assert.equal(
    projectConfig.packOptions.include.some(
      (item) => item.type === "folder" && item.value === "exercise/assets",
    ),
    false,
  );

  const imagePaths = [...pageSource.matchAll(/"(https:\/\/gufeifei\.cn\/exercise\/assets\/[^"]+\.png)"/g)]
    .map((match) => match[1]);
  assert.equal(imagePaths.length, 40);
  await Promise.all(
    imagePaths.map((imagePath) =>
      access(new URL(`public${new URL(imagePath).pathname}`, projectRoot)),
    ),
  );
});

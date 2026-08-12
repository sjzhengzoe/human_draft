import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("home module settings uses an independent page route", async () => {
  const [appConfigSource, settingsPageSource, moduleSettingsConfigSource] =
    await Promise.all([
      readFile(new URL("../../src/app.json", import.meta.url), "utf8"),
      readFile(new URL("../../src/pages/settings/index.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../../src/pages/settings/home-modules/index.json", import.meta.url),
        "utf8",
      ),
    ]);

  const appConfig = JSON.parse(appConfigSource);
  const moduleSettingsConfig = JSON.parse(moduleSettingsConfigSource);

  assert.ok(appConfig.pages.includes("pages/settings/home-modules/index"));
  assert.match(settingsPageSource, /wx\.navigateTo\(\{[\s\S]*?pages\/settings\/home-modules\/index/);
  assert.doesNotMatch(settingsPageSource, /showModuleSettings|setTabBarHidden/);
  assert.notEqual(moduleSettingsConfig.disableScroll, true);
});

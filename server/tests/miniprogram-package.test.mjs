import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const maxMediaAssetSize = 200_000;

async function collectMediaAssets(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const assets = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectMediaAssets(entryPath);
      return /\.(?:jpe?g|png|gif|webp|svg|mp3|aac|wav|ogg)$/i.test(entry.name)
        ? [entryPath]
        : [];
    }),
  );
  return assets.flat();
}

test("bundled image and audio stay within the 200 KB quality limit", async () => {
  const mediaAssets = await collectMediaAssets(sourceRoot);
  const oversizedAssets = [];
  let totalMediaAssetSize = 0;

  for (const assetPath of mediaAssets) {
    const assetStat = await stat(assetPath);
    totalMediaAssetSize += assetStat.size;
    if (assetStat.size > maxMediaAssetSize) {
      oversizedAssets.push({
        path: path.relative(sourceRoot, assetPath),
        size: assetStat.size,
      });
    }
  }

  assert.deepEqual(oversizedAssets, []);
  assert.equal(
    totalMediaAssetSize <= maxMediaAssetSize,
    true,
    `bundled media totals ${totalMediaAssetSize} bytes`,
  );
});

test("dynamic home module assets are PNG files explicitly included in uploads", async () => {
  const projectConfig = JSON.parse(
    await readFile(path.join(projectRoot, "project.config.json"), "utf8"),
  );
  const moduleSource = await readFile(
    path.join(sourceRoot, "utils/home-modules.js"),
    "utf8",
  );
  const imagePaths = [
    ...moduleSource.matchAll(/(?:image|decoration): "(\/assets\/home-modules\/[^"]+)"/g),
  ]
    .map((match) => match[1]);

  assert.equal(imagePaths.length, 15);
  assert.equal(imagePaths.every((imagePath) => imagePath.endsWith(".png")), true);
  assert.equal(
    projectConfig.packOptions.include.some(
      (item) => item.type === "folder" && item.value === "assets/home-modules",
    ),
    true,
  );
  await Promise.all(
    imagePaths.map((imagePath) => access(path.join(sourceRoot, imagePath.slice(1)))),
  );
});

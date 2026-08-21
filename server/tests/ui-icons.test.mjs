import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function listWxmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return listWxmlFiles(path);
      return entry.name.endsWith(".wxml") ? [path] : [];
    }),
  );
  return files.flat();
}

test("icon-only controls are documented as accessible shared components", async () => {
  const [guidance, documentation] = await Promise.all([
    readFile(new URL("../../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../../docs/ui-icons.md", import.meta.url), "utf8"),
  ]);

  assert.match(guidance, /Follow `docs\/ui-icons\.md`/);
  assert.match(guidance, /icon-only controls without duplicate visible text/);
  assert.match(guidance, /accurate `aria-label`/);
  assert.match(guidance, /short text button, badge, or generic status label/);
  assert.match(guidance, /Doodle Icons is the default and only business icon source/);
  assert.match(guidance, /do not use text glyphs, Unicode symbols, or Emoji/);
  assert.match(documentation, /优先使用纯图标/);
  assert.match(documentation, /Doodle Icons 是业务界面默认且唯一的图标来源/);
  assert.match(documentation, /禁止使用文字字形、Unicode 符号或 Emoji 代替视觉图标/);
  assert.match(documentation, /默认使用图标，不再显示同义文字/);
  assert.match(documentation, /非交互状态图标不需要扩展为按钮点击区/);
  assert.match(documentation, /必须提供准确的 `aria-label`/);
  assert.match(documentation, /不得小于 `56rpx × 56rpx`/);
  assert.match(documentation, /全局 `app-icon`/);
  assert.match(documentation, /大号 `30rpx`、中号 `27rpx`、小号 `24rpx`、微型 `16rpx`/);
  assert.match(documentation, /微型 `16rpx` 是图标的最小尺寸/);
});

test("shared icons use only the 16rpx, 24rpx, 27rpx, and 30rpx size tiers", async () => {
  const sourceRoot = new URL("../../src/", import.meta.url);
  const [files, component] = await Promise.all([
    listWxmlFiles(sourceRoot),
    readFile(new URL("../../src/components/app-icon/index.ts", import.meta.url), "utf8"),
  ]);
  const allowedSizes = new Set(["16", "24", "27", "30"]);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/<app-icon\b[^>]*\/>/g)) {
      const size = match[0].match(/\bsize="([^"]+)"/);
      if (size && !allowedSizes.has(size[1])) {
        violations.push(`${file.pathname}: ${size[1]}`);
      }
    }
  }

  assert.deepEqual(violations, []);
  assert.match(component, /size:\s*\{[\s\S]*?value:\s*27/);
});

test("media rating stars share one hand-drawn contour with distinct fill states", async () => {
  const [selectedIcon, unselectedIcon] = await Promise.all([
    readFile(new URL("../../src/assets/icons/lucide/star-rating-filled.svg", import.meta.url), "utf8"),
    readFile(new URL("../../src/assets/icons/lucide/star-muted.svg", import.meta.url), "utf8"),
  ]);
  const selectedPath = selectedIcon.match(/<path d="([^"]+)"/)?.[1] ?? "";
  const unselectedPath = unselectedIcon.match(/<path d="([^"]+)"/)?.[1] ?? "";

  assert.match(selectedIcon, /Outer contour from Khushmeen Sidhu's Doodle Icons Star/);
  assert.equal(selectedPath.match(/M/g)?.length, 1);
  assert.equal(unselectedPath.match(/M/g)?.length, 2);
  assert.ok(unselectedPath.startsWith(selectedPath));
});

test("media favorite hearts share one hand-drawn contour with distinct fill states", async () => {
  const [selectedIcon, unselectedIcon] = await Promise.all([
    readFile(new URL("../../src/assets/icons/lucide/heart-favorite-filled.svg", import.meta.url), "utf8"),
    readFile(new URL("../../src/assets/icons/lucide/heart-muted.svg", import.meta.url), "utf8"),
  ]);
  const selectedPath = selectedIcon.match(/<path d="([^"]+)"/)?.[1] ?? "";
  const unselectedPath = unselectedIcon.match(/<path d="([^"]+)"/)?.[1] ?? "";

  assert.match(selectedIcon, /Outer contour from Khushmeen Sidhu's Doodle Icons Heart/);
  assert.equal(selectedPath.match(/M/g)?.length, 1);
  assert.equal(unselectedPath.match(/M/g)?.length, 2);
  assert.ok(unselectedPath.startsWith(selectedPath));
});

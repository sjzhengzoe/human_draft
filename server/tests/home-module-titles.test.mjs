import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

const homeModules = [
  {
    title: "图文卡片",
    configPaths: ["src/pages/text-card/index.json"],
    headerPath: "src/pages/text-card/index.wxml"
  },
  {
    title: "我的菜单",
    configPaths: ["src/pages/menu/index.json"],
    headerPath: "src/pages/menu/index.wxml"
  },
  {
    title: "影视片单",
    configPaths: ["src/pages/media/index.json"],
    headerPath: "src/pages/media/index.wxml"
  },
  {
    title: "活动清单",
    configPaths: ["src/pages/activities/index.json"],
    headerPath: "src/pages/activities/index.wxml"
  },
  {
    title: "聊天话题",
    configPaths: ["src/pages/chat-topics/index.json"],
    headerPath: "src/pages/chat-topics/index.wxml"
  },
  {
    title: "运动养宠",
    configPaths: ["src/exercise/pages/index.json"],
    headerPath: "src/exercise/pages/index.wxml"
  },
  {
    title: "行李清单",
    configPaths: ["src/pages/luggage/index.json"],
    headerPath: "src/pages/luggage/index.wxml"
  },
  {
    title: "衣物尺寸",
    configPaths: ["src/pages/wardrobe/index.json"],
    headerPath: "src/pages/wardrobe/index.wxml"
  },
  {
    title: "人生节点",
    configPaths: ["src/pages/key-moments/index.json"],
    headerPath: "src/pages/key-moments/index.wxml"
  },
  {
    title: "全国足迹",
    configPaths: ["src/pages/footprint/index.json"],
    headerPath: "src/pages/footprint/index.wxml"
  }
]

test("home module titles stay aligned with their destination page headers", async () => {
  const homeModuleSource = await readProjectFile("src/utils/home-modules.js")

  for (const module of homeModules) {
    assert.match(homeModuleSource, new RegExp(`title: "${module.title}"`))

    const [headerSource, ...configSources] = await Promise.all([
      readProjectFile(module.headerPath),
      ...module.configPaths.map(readProjectFile)
    ])
    assert.match(headerSource, new RegExp(module.title))

    for (const configSource of configSources) {
      const config = JSON.parse(configSource)
      assert.equal(config.navigationBarTitleText, module.title)
    }
  }
})

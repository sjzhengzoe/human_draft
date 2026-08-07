import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const projectRoot = new URL("../../", import.meta.url)

function readProjectFile(path) {
  return readFile(new URL(path, projectRoot), "utf8")
}

function parseProvinceDefinitions(source) {
  const match = source.match(
    /FOOTPRINT_PROVINCES[^=]*= (\[[\s\S]*?\])\n\nexport const/
  )
  assert.ok(match, "footprint province definitions should be parseable")
  return JSON.parse(match[1])
}

test("footprint page is registered and reachable from the home modules", async () => {
  const [appSource, homeModules] = await Promise.all([
    readProjectFile("src/app.json"),
    readProjectFile("src/utils/home-modules.js")
  ])
  const app = JSON.parse(appSource)

  assert.ok(app.pages.includes("pages/footprint/index"))
  assert.match(homeModules, /key: "footprint"/)
  assert.match(homeModules, /path: "\/pages\/footprint\/index"/)
  assert.match(homeModules, /icon: "map-pinned"/)
})

test("footprint regions use stable pinyin order and a consistent total", async () => {
  const source = await readProjectFile("src/data/footprint-regions.ts")
  const provinces = parseProvinceDefinitions(source)
  const collator = new Intl.Collator("zh-CN-u-co-pinyin")
  const provinceNames = provinces.map((province) => province.name)

  assert.equal(provinces.length, 34)
  assert.deepEqual(provinceNames, [...provinceNames].sort(collator.compare))
  for (const province of provinces) {
    const cityNames = province.cities.map((city) => city.name)
    assert.deepEqual(
      cityNames,
      [...cityNames].sort(collator.compare),
      `${province.name} cities should be sorted by pinyin`
    )
  }

  const cityCount = provinces.reduce(
    (total, province) => total + province.cities.length,
    0
  )
  assert.equal(cityCount, 340)
  assert.match(source, /FOOTPRINT_TOTAL_CITY_COUNT = 340/)
})

test("city geometry covers all 333 prefecture-level divisions", async () => {
  const source = await readProjectFile(
    "public/maps/footprint-city-geometry.json"
  )
  const geometry = JSON.parse(source)
  const cities = Object.values(geometry.provinces).flat()

  assert.equal(geometry.version, 1)
  assert.equal(Object.keys(geometry.provinces).length, 27)
  assert.equal(cities.length, 333)
  assert.ok(
    geometry.provinces["海南"].some((city) => city.name === "三沙")
  )
})

test("footprint interaction is direct, compact, and contains no map hints", async () => {
  const [page, logic, styles, renderer] = await Promise.all([
    readProjectFile("src/pages/footprint/index.wxml"),
    readProjectFile("src/pages/footprint/index.ts"),
    readProjectFile("src/pages/footprint/index.less"),
    readProjectFile("src/utils/footprint-map.ts")
  ])

  assert.match(page, /catchtap="handleCityTap"/)
  assert.match(page, /aria-pressed="\{\{city\.visited\}\}"/)
  assert.match(page, /city-chip__marker/)
  assert.match(logic, /visitedCityCodes\.delete\(cityCode\)/)
  assert.match(logic, /visitedCityCodes\.add\(cityCode\)/)
  assert.match(logic, /Math\.round\(\(visitedCount \/ cities\.length\) \* 1000\) \/ 10/)
  assert.match(logic, /fullyVisited: cities\.length > 0 && visitedCount === cities\.length/)
  assert.match(page, /province\.fullyVisited \? 'province-card--complete'/)
  assert.match(page, /style="width: \{\{province\.progressPercent\}\}%;"/)
  assert.match(page, /province\.visitedCount > 0 && !province\.fullyVisited/)
  assert.match(page, /province\.identityOnProgress \? 'province-card__copy--on-progress'/)
  assert.match(page, /province\.asideOnProgress \? 'province-card__aside--on-progress'/)
  assert.match(page, /province\.fullyVisited \? 'province-card__chevron--complete'/)
  assert.match(styles, /\.province-card__chevron--complete\s*\{[\s\S]*?filter: brightness\(0\) invert\(1\);/)
  assert.match(styles, /\.province-card__progress\s*\{[\s\S]*?background: #189d4c;/)
  assert.match(styles, /\.province-card__name\s*\{[\s\S]*?font-size: var\(--ui-font-size-base\);/)
  assert.match(styles, /\.city-grid\s*\{[\s\S]*?padding: 14rpx 16rpx 16rpx;[\s\S]*?border-top:/)
  assert.match(styles, /\.city-chip\s*\{[\s\S]*?height: 50rpx;[\s\S]*?font-size: var\(--ui-font-size-small\);/)
  assert.doesNotMatch(logic, /const provinceStillVisited/)
  assert.doesNotMatch(logic, /const activeTab = provinceStillVisited/)
  assert.doesNotMatch(page, /省名直接标在区域内|绿色\s*=|app-dialog|picker/)
  assert.doesNotMatch(logic, /日期|date|showModal/)
  assert.match(styles, /grid-template-columns: repeat\(4/)
  assert.match(styles, /\.city-chip--visited\s*\{[\s\S]*?background: #111111;[\s\S]*?color: #ffffff;/)
  assert.match(styles, /\.city-chip\s*\{[\s\S]*?background: #ffffff;[\s\S]*?color: #252925;/)
  assert.match(styles, /\.map-level-switch__button\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(styles, /\.province-tabs__button\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(renderer, /UI_FONT\.family/)
  assert.match(renderer, /const VISITED_FILL = "#189d4c"/)
  assert.match(renderer, /const VISITED_GLOW = "rgba\(31, 216, 101, 0\.58\)"/)
  assert.match(renderer, /const VISITED_TEXT = "#ffffff"/)
  assert.match(renderer, /const isSelected = province\.name === selectedProvince/)
  assert.match(renderer, /if \(!isVisited && !isSelected\) \{[\s\S]*?context\.strokeText\(province\.name, x, y\)/)
  assert.match(renderer, /isVisited \|\| isSelected \? VISITED_TEXT : MUTED_TEXT/)
  assert.doesNotMatch(renderer, /VISITED_LABEL_HALO/)
  assert.match(renderer, /const SELECTED_FILL = "#111111"/)
  assert.match(renderer, /const SELECTED_CITY_OVERLAY = "rgba\(17, 17, 17, 0\.28\)"/)
  assert.match(renderer, /const BORDER_COLOR = "#ffffff"/)
  assert.match(renderer, /context\.shadowBlur = glowBlur/)
  assert.doesNotMatch(renderer, /const SELECTED_COLOR|const SELECTED_HALO/)
  assert.doesNotMatch(renderer, /province\.name === selectedProvince[\s\S]*?SELECTED_COLOR/)
  assert.match(logic, /selectedProvinceName = shouldExpand \? provinceName : ""/)
  assert.match(logic, /const remainsInCurrentTab =/)
  assert.match(styles, /\.province-tabs__button--active\s*\{[\s\S]*?background: #189d4c;[\s\S]*?color: #ffffff;/)
  assert.doesNotMatch(styles, /#8fbea0|#83b293|#e2f0e6|#62aa79|#3e8a5d/)
  assert.match(logic, /initializeUIFont\(\)[\s\S]*?\.then\(\(\) => \{[\s\S]*?this\.drawMap\(\)/)

  const fontSizes = [...styles.matchAll(/font-size:\s*(\d+)rpx/g)].map(
    (match) => Number(match[1])
  )
  assert.ok(fontSizes.every((size) => [20, 23, 25].includes(size)))
})

test("footprint map projects longitude and latitude with matching units", async () => {
  const renderer = await readProjectFile("src/utils/footprint-map.ts")

  assert.match(renderer, /const longitude = point\[0\] \* Math\.PI \/ 180/)
  assert.match(renderer, /return \[longitude, -Math\.log/)
  assert.doesNotMatch(renderer, /return \[point\[0\], -Math\.log/)
})

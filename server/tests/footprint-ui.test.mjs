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
  const registeredPages = [
    ...app.pages,
    ...app.subPackages.flatMap((subPackage) =>
      subPackage.pages.map((page) => `${subPackage.root}/${page}`)
    )
  ]

  assert.ok(registeredPages.includes("pages/footprint/index"))
  assert.match(homeModules, /key: "footprint"/)
  assert.match(homeModules, /path: "\/pages\/footprint\/index"/)
  assert.match(homeModules, /icon: "map-pinned"/)
  assert.doesNotMatch(homeModules, /requiresLogin/)
})

test("footprint records load and save directly against the authenticated user's cloud data", async () => {
  const [page, logic, client, route, migration, cleanupMigration] = await Promise.all([
    readProjectFile("src/pages/footprint/index.wxml"),
    readProjectFile("src/pages/footprint/index.ts"),
    readProjectFile("src/services/footprint.ts"),
    readProjectFile("server/routes/footprint.mjs"),
    readProjectFile("supabase/migrations/202608110002_user_footprint_cities.sql"),
    readProjectFile("supabase/migrations/202608110003_remove_footprint_local_merge.sql")
  ])

  assert.match(page, /operation-loading visible="\{\{footprintLoading\}\}"/)
  assert.match(logic, /const cloudCityCodes = await listFootprintCityCodes\(\)/)
  assert.match(logic, /await setFootprintCityVisited\(cityCode, !wasVisited\)/)
  assert.match(logic, /足迹保存失败，已恢复原状态/)
  assert.match(client, /path: `\/api\/footprint\/cities\/\$\{encodeURIComponent\(cityCode\)\}`/)
  assert.doesNotMatch(logic, /footprint-storage|mergeLocalFootprint|localCityCodes/)
  assert.doesNotMatch(client, /merge-local|mergeLocalFootprint/)
  assert.doesNotMatch(route, /merge-local|mergeFootprint/)
  assert.ok(
    (route.match(/preHandler: authenticated/g) || []).length >= 2,
    "every footprint route should require authentication"
  )
  assert.match(migration, /create table if not exists public\.user_footprint_cities/i)
  assert.match(migration, /references public\.app_users\(id\) on delete cascade/i)
  assert.match(migration, /primary key \(user_id, city_code\)/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /drop table|drop column|truncate/i)
  assert.match(cleanupMigration, /drop function if exists public\.merge_user_footprint_cities/i)
  assert.doesNotMatch(cleanupMigration, /drop table|delete from|truncate/i)
  await assert.rejects(
    readProjectFile("src/utils/footprint-storage.ts"),
    (error) => error?.code === "ENOENT"
  )
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
  assert.match(styles, /\.province-card__progress\s*\{[\s\S]*?background: var\(--ui-color-success\);/)
  assert.match(styles, /\.province-card__name\s*\{[\s\S]*?font-size: var\(--ui-font-size-base\);/)
  assert.match(styles, /\.city-grid\s*\{[\s\S]*?padding: 14rpx 16rpx 16rpx;[\s\S]*?border-top:/)
  assert.match(styles, /\.city-chip\s*\{[\s\S]*?height: 60rpx;[\s\S]*?font-size: var\(--ui-font-size-base\);/)
  assert.doesNotMatch(logic, /const provinceStillVisited/)
  assert.doesNotMatch(logic, /const activeTab = provinceStillVisited/)
  assert.doesNotMatch(page, /省名直接标在区域内|绿色\s*=|app-dialog|picker/)
  assert.doesNotMatch(logic, /日期|date|showModal/)
  assert.match(page, /catchtap="handleCityPlacesTap"/)
  assert.match(page, />地点<\/view>/)
  assert.match(logic, /pages\/footprint\/places\/index\?cityCode=/)
  assert.match(styles, /grid-template-columns: repeat\(2/)
  assert.match(styles, /\.city-chip--visited\s*\{[\s\S]*?background: var\(--ui-color-success\);[\s\S]*?color: var\(--ui-color-text-inverse\);[\s\S]*?box-shadow: 0 6rpx 14rpx var\(--footprint-color-success-shadow\);/)
  assert.match(styles, /\.city-chip\s*\{[\s\S]*?background: var\(--ui-color-background-surface\);[\s\S]*?color: var\(--footprint-color-text-primary\);/)
  assert.match(styles, /\.map-level-switch__button\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(styles, /\.province-tabs__button\s*\{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/)
  assert.match(renderer, /UI_FONT\.family/)
  assert.match(renderer, /const VISITED_FILL = FOOTPRINT_COLORS\.visitedFill/)
  assert.match(renderer, /const VISITED_GLOW = FOOTPRINT_COLORS\.visitedGlow/)
  assert.match(renderer, /const VISITED_TEXT = FOOTPRINT_COLORS\.visitedText/)
  assert.match(renderer, /const isSelected = province\.name === selectedProvince/)
  assert.match(renderer, /if \(!isVisited && !isSelected\) \{[\s\S]*?context\.strokeText\(province\.name, x, y\)/)
  assert.match(renderer, /isVisited \|\| isSelected \? VISITED_TEXT : MUTED_TEXT/)
  assert.doesNotMatch(renderer, /VISITED_LABEL_HALO/)
  assert.match(renderer, /const SELECTED_FILL = FOOTPRINT_COLORS\.selectedFill/)
  assert.match(renderer, /const SELECTED_CITY_OVERLAY = FOOTPRINT_COLORS\.selectedCityOverlay/)
  assert.match(renderer, /const BORDER_COLOR = FOOTPRINT_COLORS\.border/)
  assert.match(renderer, /context\.shadowBlur = glowBlur/)
  assert.doesNotMatch(renderer, /const SELECTED_COLOR|const SELECTED_HALO/)
  assert.doesNotMatch(renderer, /province\.name === selectedProvince[\s\S]*?SELECTED_COLOR/)
  assert.match(logic, /selectedProvinceName = shouldExpand \? provinceName : ""/)
  assert.match(logic, /const remainsInCurrentTab =/)
  assert.match(styles, /\.province-tabs__button--active\s*\{[\s\S]*?background: var\(--ui-color-action-primary\);[\s\S]*?color: var\(--ui-color-text-inverse\);/)
  assert.doesNotMatch(styles, /#8fbea0|#83b293|#e2f0e6|#62aa79|#3e8a5d/)
  assert.match(logic, /initializeUIFont\(\)[\s\S]*?\.then\(\(\) => \{[\s\S]*?this\.drawMap\(\)/)

  assert.doesNotMatch(styles, /font-size:\s*\d+rpx/)
})

test("city places support a cloud-backed travel wishlist and visited list", async () => {
  const [appSource, page, logic, styles, client, route, service, migration] = await Promise.all([
    readProjectFile("src/app.json"),
    readProjectFile("src/pages/footprint/places/index.wxml"),
    readProjectFile("src/pages/footprint/places/index.ts"),
    readProjectFile("src/pages/footprint/places/index.less"),
    readProjectFile("src/services/footprint.ts"),
    readProjectFile("server/routes/footprint.mjs"),
    readProjectFile("server/domains/footprint/service.mjs"),
    readProjectFile("supabase/migrations/20260815110606_footprint_city_places.sql")
  ])
  const app = JSON.parse(appSource)
  const footprintPackage = app.subPackages.find((item) => item.root === "pages/footprint")

  assert.ok(footprintPackage.pages.includes("places/index"))
  assert.match(page, /想去 \{\{plannedCount\}\}/)
  assert.match(page, /去过 \{\{visitedCount\}\}/)
  assert.match(page, /placement="bottom"/)
  assert.match(page, /dialog-mode="\{\{true\}\}"/)
  assert.match(page, /handlePlaceStatusToggle/)
  assert.match(page, /<app-dialog[\s\S]*?title="删除地点"/)
  assert.doesNotMatch(logic, /showModal/)
  assert.match(logic, /current\.status === "planned" \? "visited" : "planned"/)
  assert.match(client, /\/api\/footprint\/cities\/\$\{encodeURIComponent\(cityCode\)\}\/places/)
  assert.match(client, /\/api\/footprint\/places\/\$\{encodeURIComponent\(placeId\)\}/)
  assert.ok((route.match(/preHandler: authenticated/g) || []).length >= 6)
  assert.match(service, /\.eq\("uid", uid\)/)
  assert.match(migration, /create table if not exists public\.user_footprint_city_places/i)
  assert.match(migration, /references public\.app_users\(uid\) on delete cascade/i)
  assert.match(migration, /status in \('planned', 'visited'\)/i)
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /revoke all on table public\.user_footprint_city_places[\s\S]*from public, anon, authenticated/i)
  assert.match(styles, /\.city-places-tab--active\s*\{[\s\S]*?background: var\(--ui-color-action-primary\);[\s\S]*?color: var\(--ui-color-text-inverse\);/)
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}|rgba?\(|hsla?\(/i)
  assert.doesNotMatch(styles, /font-size:\s*\d+rpx/)
})

test("footprint map projects longitude and latitude with matching units", async () => {
  const renderer = await readProjectFile("src/utils/footprint-map.ts")

  assert.match(renderer, /const longitude = point\[0\] \* Math\.PI \/ 180/)
  assert.match(renderer, /return \[longitude, -Math\.log/)
  assert.doesNotMatch(renderer, /return \[point\[0\], -Math\.log/)
})

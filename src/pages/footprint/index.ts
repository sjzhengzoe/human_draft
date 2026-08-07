import {
  FOOTPRINT_PROVINCES,
  FOOTPRINT_TOTAL_CITY_COUNT,
  FOOTPRINT_TOTAL_PROVINCE_COUNT,
  type FootprintCityDefinition,
  type FootprintProvinceDefinition
} from "../../data/footprint-regions"
import {
  loadFootprintCityGeometry,
  type FootprintCityGeometryData
} from "../../services/footprint-map"
import { initializeUIFont } from "../../services/ui-font"
import {
  drawFootprintMap,
  type FootprintCanvasContext,
  type FootprintCanvasNode,
  type FootprintMapLevel
} from "../../utils/footprint-map"
import {
  readVisitedFootprintCityCodes,
  saveVisitedFootprintCityCodes
} from "../../utils/footprint-storage"

type FootprintCityView = FootprintCityDefinition & {
  visited: boolean
}

type FootprintProvinceView = Omit<FootprintProvinceDefinition, "cities"> & {
  cities: FootprintCityView[]
  visitedCount: number
  totalCount: number
  progressPercent: number
  fullyVisited: boolean
  expanded: boolean
}

type FootprintCanvasState = {
  context: FootprintCanvasContext
  width: number
  height: number
}

type FootprintCanvasQueryResult = {
  node?: FootprintCanvasNode
  width?: number
  height?: number
}

let visitedCityCodes = new Set<string>()
let expandedProvinceCode = ""
let selectedProvinceName = ""
let canvasState: FootprintCanvasState | undefined
let cityGeometry: FootprintCityGeometryData | undefined
let pageActive = false

function createProvinceView(
  province: FootprintProvinceDefinition
): FootprintProvinceView {
  const cities = province.cities.map((city) => ({
    ...city,
    visited: visitedCityCodes.has(city.code)
  }))
  const visitedCount = cities.filter((city) => city.visited).length
  return {
    ...province,
    cities,
    visitedCount,
    totalCount: cities.length,
    progressPercent:
      cities.length > 0
        ? Math.round((visitedCount / cities.length) * 1000) / 10
        : 0,
    fullyVisited: cities.length > 0 && visitedCount === cities.length,
    expanded: province.code === expandedProvinceCode
  }
}

function createProvinceLists(): {
  visited: FootprintProvinceView[]
  unvisited: FootprintProvinceView[]
} {
  const provinces = FOOTPRINT_PROVINCES.map(createProvinceView)
  return {
    visited: provinces.filter((province) => province.visitedCount > 0),
    unvisited: provinces.filter((province) => province.visitedCount === 0)
  }
}

Page({
  data: {
    mapLevel: "province" as FootprintMapLevel,
    activeTab: "unvisited" as "visited" | "unvisited",
    totalProvinceCount: FOOTPRINT_TOTAL_PROVINCE_COUNT,
    totalCityCount: FOOTPRINT_TOTAL_CITY_COUNT,
    visitedProvinceCount: 0,
    visitedCityCount: 0,
    visitedProvinces: [] as FootprintProvinceView[],
    unvisitedProvinces: [] as FootprintProvinceView[],
    mapCityLoading: true,
    mapCityFailed: false
  },

  onLoad() {
    pageActive = true
    visitedCityCodes = readVisitedFootprintCityCodes()
    const lists = createProvinceLists()
    const activeTab = lists.visited.length > 0 ? "visited" : "unvisited"
    this.setData({ activeTab })
    this.rebuildLists()
    void initializeUIFont()
      .then(() => {
        if (pageActive) this.drawMap()
      })
      .catch((error) => {
        console.warn("足迹页通用字体加载失败，使用系统字体回退", error)
      })
  },

  onReady() {
    void this.initializeCanvas()
    void this.loadCityMap()
  },

  onUnload() {
    pageActive = false
    canvasState = undefined
    cityGeometry = undefined
    expandedProvinceCode = ""
    selectedProvinceName = ""
  },

  onResize() {
    void this.initializeCanvas()
  },

  rebuildLists(callback?: () => void) {
    const lists = createProvinceLists()
    this.setData(
      {
        visitedProvinces: lists.visited,
        unvisitedProvinces: lists.unvisited,
        visitedProvinceCount: lists.visited.length,
        visitedCityCount: visitedCityCodes.size
      },
      callback
    )
  },

  initializeCanvas(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      wx.createSelectorQuery()
        .select("#footprintMapCanvas")
        .fields({ node: true, size: true }, (result) => {
          const queryResult = result as unknown as FootprintCanvasQueryResult
          const canvas = queryResult.node
          const width = Number(queryResult.width) || 0
          const height = Number(queryResult.height) || 0
          if (!canvas || width <= 0 || height <= 0) {
            reject(new Error("未找到足迹地图画布"))
            return
          }
          const pixelRatio = wx.getSystemInfoSync().pixelRatio || 1
          canvas.width = Math.round(width * pixelRatio)
          canvas.height = Math.round(height * pixelRatio)
          const context = canvas.getContext("2d")
          context.scale(pixelRatio, pixelRatio)
          canvasState = { context, width, height }
          this.drawMap()
          resolve()
        })
        .exec()
    }).catch((error) => {
      console.warn("足迹地图初始化失败", error)
    })
  },

  loadCityMap(): Promise<void> {
    return loadFootprintCityGeometry()
      .then((data) => {
        if (!pageActive) return
        cityGeometry = data
        this.setData({ mapCityLoading: false, mapCityFailed: false }, () => {
          this.drawMap()
        })
      })
      .catch((error) => {
        if (!pageActive) return
        console.warn("城市地图加载失败", error)
        const shouldReturnToProvince = this.data.mapLevel === "city"
        this.setData(
          {
            mapCityLoading: false,
            mapCityFailed: true,
            mapLevel: shouldReturnToProvince ? "province" : this.data.mapLevel
          },
          () => this.drawMap()
        )
        if (shouldReturnToProvince) {
          wx.showToast({ title: "城市地图加载失败", icon: "none" })
        }
      })
  },

  drawMap() {
    if (!canvasState) return
    drawFootprintMap(
      canvasState.context,
      canvasState.width,
      canvasState.height,
      this.data.mapLevel,
      visitedCityCodes,
      selectedProvinceName,
      cityGeometry
    )
  },

  handleMapLevelTap(event: WechatMiniprogram.TouchEvent) {
    const level = event.currentTarget.dataset.level as FootprintMapLevel | undefined
    if (level !== "province" && level !== "city") return
    if (level === "city" && this.data.mapCityFailed && !cityGeometry) {
      wx.showToast({ title: "城市地图暂时不可用", icon: "none" })
      this.setData({ mapCityLoading: true, mapCityFailed: false })
      void this.loadCityMap()
      return
    }
    this.setData({ mapLevel: level }, () => this.drawMap())
  },

  handleStatusTabTap(event: WechatMiniprogram.TouchEvent) {
    const tab = event.currentTarget.dataset.tab
    if (tab !== "visited" && tab !== "unvisited") return
    this.setData({ activeTab: tab })
  },

  handleProvinceTap(event: WechatMiniprogram.TouchEvent) {
    const provinceCode = String(event.currentTarget.dataset.code || "")
    const provinceName = String(event.currentTarget.dataset.name || "")
    if (!provinceCode || !provinceName) return
    expandedProvinceCode =
      expandedProvinceCode === provinceCode ? "" : provinceCode
    selectedProvinceName = provinceName
    this.rebuildLists(() => this.drawMap())
  },

  handleCityTap(event: WechatMiniprogram.TouchEvent) {
    const cityCode = String(event.currentTarget.dataset.code || "")
    const provinceCode = String(event.currentTarget.dataset.provinceCode || "")
    const provinceName = String(event.currentTarget.dataset.provinceName || "")
    if (!cityCode || !provinceCode || !provinceName) return

    if (visitedCityCodes.has(cityCode)) visitedCityCodes.delete(cityCode)
    else visitedCityCodes.add(cityCode)

    saveVisitedFootprintCityCodes(visitedCityCodes)
    expandedProvinceCode = provinceCode
    selectedProvinceName = provinceName
    this.rebuildLists(() => this.drawMap())
  }
})

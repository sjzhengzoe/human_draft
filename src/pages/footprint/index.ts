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
import {
  listFootprintCityCodes,
  setFootprintCityVisited
} from "../../services/footprint"
import { initializeUIFont } from "../../services/ui-font"
import {
  drawFootprintMap,
  type FootprintCanvasContext,
  type FootprintCanvasNode,
  type FootprintMapLevel
} from "../../utils/footprint-map"

type FootprintCityView = FootprintCityDefinition & {
  visited: boolean
}

type FootprintProvinceView = Omit<FootprintProvinceDefinition, "cities"> & {
  cities: FootprintCityView[]
  visitedCount: number
  totalCount: number
  progressPercent: number
  fullyVisited: boolean
  identityOnProgress: boolean
  asideOnProgress: boolean
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
const pendingCityCodes = new Set<string>()

function createProvinceView(
  province: FootprintProvinceDefinition
): FootprintProvinceView {
  const cities = province.cities.map((city) => ({
    ...city,
    visited: visitedCityCodes.has(city.code)
  }))
  const visitedCount = cities.filter((city) => city.visited).length
  const progressPercent =
    cities.length > 0
      ? Math.round((visitedCount / cities.length) * 1000) / 10
      : 0
  return {
    ...province,
    cities,
    visitedCount,
    totalCount: cities.length,
    progressPercent,
    fullyVisited: cities.length > 0 && visitedCount === cities.length,
    identityOnProgress: progressPercent >= 18,
    asideOnProgress: progressPercent >= 86,
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
    footprintLoading: true,
    mapCityLoading: true,
    mapCityFailed: false
  },

  onLoad() {
    pageActive = true
    pendingCityCodes.clear()
    visitedCityCodes = new Set()
    this.setData({ activeTab: "unvisited" })
    this.rebuildLists()
    void this.loadCloudFootprint()
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
    pendingCityCodes.clear()
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

  async loadCloudFootprint() {
    this.setData({ footprintLoading: true })
    try {
      const cloudCityCodes = await listFootprintCityCodes()
      if (!pageActive) return
      visitedCityCodes = new Set(cloudCityCodes)
      const lists = createProvinceLists()
      const activeTab = lists.visited.length > 0 ? "visited" : "unvisited"
      expandedProvinceCode = ""
      selectedProvinceName = ""
      this.setData({ activeTab }, () => {
        this.rebuildLists(() => this.drawMap())
      })
    } catch (error) {
      if (!pageActive) return
      console.warn("全国足迹加载失败", error)
      wx.showToast({ title: "足迹加载失败，请稍后重试", icon: "none" })
    } finally {
      if (pageActive) this.setData({ footprintLoading: false })
    }
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
    expandedProvinceCode = ""
    selectedProvinceName = ""
    this.setData({ activeTab: tab }, () => {
      this.rebuildLists(() => this.drawMap())
    })
  },

  handleProvinceTap(event: WechatMiniprogram.TouchEvent) {
    const provinceCode = String(event.currentTarget.dataset.code || "")
    const provinceName = String(event.currentTarget.dataset.name || "")
    if (!provinceCode || !provinceName) return
    const shouldExpand = expandedProvinceCode !== provinceCode
    expandedProvinceCode = shouldExpand ? provinceCode : ""
    selectedProvinceName = shouldExpand ? provinceName : ""
    this.rebuildLists(() => this.drawMap())
  },

  async handleCityTap(event: WechatMiniprogram.TouchEvent) {
    const cityCode = String(event.currentTarget.dataset.code || "")
    const provinceCode = String(event.currentTarget.dataset.provinceCode || "")
    const provinceName = String(event.currentTarget.dataset.provinceName || "")
    if (
      !cityCode ||
      !provinceCode ||
      !provinceName ||
      this.data.footprintLoading ||
      pendingCityCodes.has(cityCode)
    ) return

    const wasVisited = visitedCityCodes.has(cityCode)
    if (wasVisited) visitedCityCodes.delete(cityCode)
    else visitedCityCodes.add(cityCode)

    pendingCityCodes.add(cityCode)
    const province = FOOTPRINT_PROVINCES.find((item) => item.code === provinceCode)
    const provinceHasVisited = Boolean(
      province?.cities.some((city) => visitedCityCodes.has(city.code))
    )
    const remainsInCurrentTab =
      this.data.activeTab === "visited" ? provinceHasVisited : !provinceHasVisited
    expandedProvinceCode = remainsInCurrentTab ? provinceCode : ""
    selectedProvinceName = remainsInCurrentTab ? provinceName : ""
    this.rebuildLists(() => this.drawMap())

    try {
      await setFootprintCityVisited(cityCode, !wasVisited)
    } catch (error) {
      if (wasVisited) visitedCityCodes.add(cityCode)
      else visitedCityCodes.delete(cityCode)
      if (pageActive) {
        console.warn("保存全国足迹失败", error)
        this.rebuildLists(() => this.drawMap())
        wx.showToast({ title: "足迹保存失败，已恢复原状态", icon: "none" })
      }
    } finally {
      pendingCityCodes.delete(cityCode)
    }
  }
})

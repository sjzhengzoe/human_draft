import type { FootprintMapPolygon } from "../data/footprint-province-geometry"

export type FootprintCityGeometry = {
  code: string
  name: string
  polygons: FootprintMapPolygon[]
}

export type FootprintCityGeometryData = {
  version: number
  provinces: Record<string, FootprintCityGeometry[]>
}

const CITY_GEOMETRY_URL =
  "https://gufeifei.cn/maps/footprint-city-geometry.json?v=1"

let geometryRequest: Promise<FootprintCityGeometryData> | undefined

function isGeometryData(value: unknown): value is FootprintCityGeometryData {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<FootprintCityGeometryData>
  return candidate.version === 1 && Boolean(candidate.provinces)
}

export function loadFootprintCityGeometry(): Promise<FootprintCityGeometryData> {
  if (geometryRequest) return geometryRequest
  const request = new Promise<FootprintCityGeometryData>((resolve, reject) => {
    wx.request<FootprintCityGeometryData>({
      url: CITY_GEOMETRY_URL,
      success: (response) => {
        if (
          response.statusCode >= 200 &&
          response.statusCode < 300 &&
          isGeometryData(response.data)
        ) {
          resolve(response.data)
          return
        }
        reject(new Error("城市地图数据不可用"))
      },
      fail: reject
    })
  })
  const pending = request.catch((error) => {
    geometryRequest = undefined
    throw error
  })
  geometryRequest = pending
  return pending
}

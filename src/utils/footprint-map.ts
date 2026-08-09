import {
  FOOTPRINT_PROVINCE_GEOMETRY,
  type FootprintMapPoint,
  type FootprintMapPolygon
} from "../data/footprint-province-geometry"
import { UI_FONT } from "../config/ui-font"
import { UI_CANVAS_FONT_SIZES } from "../styles/typography"
import { FOOTPRINT_PROVINCES } from "../data/footprint-regions"
import type { FootprintCityGeometryData } from "../services/footprint-map"
import { FOOTPRINT_COLORS } from "../styles/colors"

export type FootprintMapLevel = "province" | "city"

export type FootprintCanvasContext = {
  fillStyle: string
  strokeStyle: string
  lineWidth: number
  lineJoin: "round" | "bevel" | "miter"
  shadowBlur: number
  shadowColor: string
  shadowOffsetX: number
  shadowOffsetY: number
  font: string
  textAlign: "center"
  textBaseline: "middle"
  clearRect: (x: number, y: number, width: number, height: number) => void
  scale: (x: number, y: number) => void
  beginPath: () => void
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
  fill: (fillRule?: "nonzero" | "evenodd") => void
  stroke: () => void
  fillText: (text: string, x: number, y: number) => void
  strokeText: (text: string, x: number, y: number) => void
  save: () => void
  restore: () => void
}

export type FootprintCanvasNode = {
  width: number
  height: number
  getContext: (contextId: "2d") => FootprintCanvasContext
}

type Projection = (point: FootprintMapPoint) => [number, number]

const MAP_PADDING_X = 8
const MAP_PADDING_Y = 8
const MAP_FILL = FOOTPRINT_COLORS.mapFill
const CITY_FILL = FOOTPRINT_COLORS.cityFill
const VISITED_FILL = FOOTPRINT_COLORS.visitedFill
const VISITED_GLOW = FOOTPRINT_COLORS.visitedGlow
const BORDER_COLOR = FOOTPRINT_COLORS.border
const MUTED_TEXT = FOOTPRINT_COLORS.mutedText
const VISITED_TEXT = FOOTPRINT_COLORS.visitedText
const LABEL_HALO = FOOTPRINT_COLORS.labelHalo
const SELECTED_FILL = FOOTPRINT_COLORS.selectedFill
const SELECTED_CITY_OVERLAY = FOOTPRINT_COLORS.selectedCityOverlay
const SELECTED_GLOW = FOOTPRINT_COLORS.selectedGlow

const LABEL_OFFSETS: Record<string, [number, number]> = {
  北京: [-3, -7],
  天津: [7, 9],
  河北: [-4, 4],
  山东: [3, -2],
  江苏: [4, -4],
  浙江: [6, 3],
  安徽: [-5, 3],
  福建: [2, 0],
  宁夏: [-2, -2],
  香港: [11, 7],
  澳门: [-2, 7]
}

function mercator(point: FootprintMapPoint): [number, number] {
  const longitude = point[0] * Math.PI / 180
  const latitude = Math.max(-85, Math.min(85, point[1])) * Math.PI / 180
  return [longitude, -Math.log(Math.tan(Math.PI / 4 + latitude / 2))]
}

function createProjection(width: number, height: number): Projection {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  FOOTPRINT_PROVINCE_GEOMETRY.forEach((province) => {
    province.polygons.forEach((polygon) => {
      polygon.forEach((ring) => {
        ring.forEach((point) => {
          const [x, y] = mercator(point)
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
          minY = Math.min(minY, y)
          maxY = Math.max(maxY, y)
        })
      })
    })
  })

  const availableWidth = Math.max(width - MAP_PADDING_X * 2, 1)
  const availableHeight = Math.max(height - MAP_PADDING_Y * 2, 1)
  const scale = Math.min(
    availableWidth / Math.max(maxX - minX, 1),
    availableHeight / Math.max(maxY - minY, 1)
  )
  const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale
  const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale

  return (point) => {
    const [x, y] = mercator(point)
    return [x * scale + offsetX, y * scale + offsetY]
  }
}

function tracePolygon(
  context: FootprintCanvasContext,
  polygon: FootprintMapPolygon,
  project: Projection
): void {
  polygon.forEach((ring) => {
    ring.forEach((point, index) => {
      const [x, y] = project(point)
      if (index === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    })
    context.closePath()
  })
}

function drawPolygons(
  context: FootprintCanvasContext,
  polygons: FootprintMapPolygon[],
  project: Projection,
  fill: string,
  stroke = BORDER_COLOR,
  lineWidth = 0.55,
  glowColor = "transparent",
  glowBlur = 0
): void {
  context.save()
  context.shadowColor = glowColor
  context.shadowBlur = glowBlur
  context.shadowOffsetX = 0
  context.shadowOffsetY = 0
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = lineWidth
  polygons.forEach((polygon) => {
    context.beginPath()
    tracePolygon(context, polygon, project)
    context.fill("evenodd")
    context.stroke()
  })
  context.restore()
}

function ringArea(ring: FootprintMapPoint[], project: Projection): number {
  let area = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = project(ring[index])
    const [x2, y2] = project(ring[index + 1])
    area += x1 * y2 - x2 * y1
  }
  return area / 2
}

function ringCentroid(ring: FootprintMapPoint[], project: Projection): [number, number] {
  const area = ringArea(ring, project)
  if (Math.abs(area) < 0.001) {
    const points = ring.map(project)
    const total = points.reduce(
      (sum, point) => [sum[0] + point[0], sum[1] + point[1]] as [number, number],
      [0, 0] as [number, number]
    )
    return [total[0] / Math.max(points.length, 1), total[1] / Math.max(points.length, 1)]
  }

  let x = 0
  let y = 0
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = project(ring[index])
    const [x2, y2] = project(ring[index + 1])
    const cross = x1 * y2 - x2 * y1
    x += (x1 + x2) * cross
    y += (y1 + y2) * cross
  }
  return [x / (6 * area), y / (6 * area)]
}

function provinceLabelPoint(
  polygons: FootprintMapPolygon[],
  project: Projection
): [number, number] {
  let largestRing = polygons[0]?.[0] || []
  let largestArea = 0
  polygons.forEach((polygon) => {
    const outerRing = polygon[0] || []
    const area = Math.abs(ringArea(outerRing, project))
    if (area > largestArea) {
      largestArea = area
      largestRing = outerRing
    }
  })
  return ringCentroid(largestRing, project)
}

function visitedProvinceNames(visitedCityCodes: Set<string>): Set<string> {
  return new Set(
    FOOTPRINT_PROVINCES.filter((province) =>
      province.cities.some((city) => visitedCityCodes.has(city.code))
    ).map((province) => province.name)
  )
}

export function drawFootprintMap(
  context: FootprintCanvasContext,
  width: number,
  height: number,
  level: FootprintMapLevel,
  visitedCityCodes: Set<string>,
  selectedProvince: string,
  cityGeometry?: FootprintCityGeometryData
): void {
  context.clearRect(0, 0, width, height)
  context.lineJoin = "round"
  const project = createProjection(width, height)
  const visitedProvinces = visitedProvinceNames(visitedCityCodes)

  FOOTPRINT_PROVINCE_GEOMETRY.forEach((province) => {
    const isVisited = visitedProvinces.has(province.name)
    const fill = level === "province" && isVisited ? VISITED_FILL : MAP_FILL
    drawPolygons(
      context,
      province.polygons,
      project,
      fill,
      BORDER_COLOR,
      0.55,
      level === "province" && isVisited ? VISITED_GLOW : "transparent",
      level === "province" && isVisited ? 7 : 0
    )
  })

  if (level === "city" && cityGeometry) {
    Object.values(cityGeometry.provinces).forEach((cities) => {
      cities.forEach((city) => {
        const isVisited = visitedCityCodes.has(city.code)
        drawPolygons(
          context,
          city.polygons,
          project,
          isVisited ? VISITED_FILL : CITY_FILL,
          BORDER_COLOR,
          0.42,
          isVisited ? VISITED_GLOW : "transparent",
          isVisited ? 5 : 0
        )
      })
    })

    FOOTPRINT_PROVINCES.filter((province) => province.cities.length === 1).forEach(
      (province) => {
        const geometry = FOOTPRINT_PROVINCE_GEOMETRY.find(
          (item) => item.name === province.name
        )
        if (!geometry) return
        const isVisited = visitedCityCodes.has(province.cities[0].code)
        drawPolygons(
          context,
          geometry.polygons,
          project,
          isVisited ? VISITED_FILL : CITY_FILL,
          BORDER_COLOR,
          0.55,
          isVisited ? VISITED_GLOW : "transparent",
          isVisited ? 5 : 0
        )
      }
    )
  }

  if (selectedProvince) {
    const selectedGeometry = FOOTPRINT_PROVINCE_GEOMETRY.find(
      (province) => province.name === selectedProvince
    )
    if (selectedGeometry) {
      drawPolygons(
        context,
        selectedGeometry.polygons,
        project,
        level === "province" ? SELECTED_FILL : SELECTED_CITY_OVERLAY,
        BORDER_COLOR,
        level === "province" ? 0.8 : 1.05,
        SELECTED_GLOW,
        level === "province" ? 11 : 8
      )
    }
  }

  context.font = `normal ${UI_CANVAS_FONT_SIZES.small}px "${UI_FONT.family}", "PingFang SC", sans-serif`
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.lineWidth = 2.5
  FOOTPRINT_PROVINCE_GEOMETRY.forEach((province) => {
    const [baseX, baseY] = provinceLabelPoint(province.polygons, project)
    const [offsetX, offsetY] = LABEL_OFFSETS[province.name] || [0, 0]
    const x = baseX + offsetX
    const y = baseY + offsetY
    const isVisited = visitedProvinces.has(province.name)
    const isSelected = province.name === selectedProvince
    if (!isVisited && !isSelected) {
      context.strokeStyle = LABEL_HALO
      context.strokeText(province.name, x, y)
    }
    context.fillStyle = isVisited || isSelected ? VISITED_TEXT : MUTED_TEXT
    context.fillText(province.name, x, y)
  })
}

import { FOOTPRINT_PROVINCES } from "../data/footprint-regions"

const FOOTPRINT_STORAGE_KEY = "FOOTPRINT_VISITED_CITY_CODES_V1"
const FOOTPRINT_CITY_CODES = new Set(
  FOOTPRINT_PROVINCES.flatMap((province) => province.cities.map((city) => city.code))
)

export function readVisitedFootprintCityCodes(): Set<string> {
  const stored = wx.getStorageSync(FOOTPRINT_STORAGE_KEY)
  if (!Array.isArray(stored)) return new Set()
  return new Set(
    stored.filter(
      (code): code is string => typeof code === "string" && FOOTPRINT_CITY_CODES.has(code)
    )
  )
}

export function saveVisitedFootprintCityCodes(codes: Set<string>): void {
  const stored = [...codes].filter((code) => FOOTPRINT_CITY_CODES.has(code)).sort()
  if (stored.length === 0) {
    wx.removeStorageSync(FOOTPRINT_STORAGE_KEY)
    return
  }
  wx.setStorageSync(FOOTPRINT_STORAGE_KEY, stored)
}

import { request } from "./request"

type FootprintCityCodesResponse = {
  city_codes: string[]
}

export async function listFootprintCityCodes(): Promise<string[]> {
  const data = await request<FootprintCityCodesResponse>({ path: "/api/footprint" })
  return data.city_codes
}

export async function mergeLocalFootprintCityCodes(cityCodes: string[]): Promise<string[]> {
  const data = await request<FootprintCityCodesResponse>({
    path: "/api/footprint/merge-local",
    method: "PUT",
    data: { city_codes: cityCodes }
  })
  return data.city_codes
}

export async function setFootprintCityVisited(
  cityCode: string,
  visited: boolean
): Promise<void> {
  await request<{ city_code: string; visited: boolean }>({
    path: `/api/footprint/cities/${encodeURIComponent(cityCode)}`,
    method: "PUT",
    data: { visited }
  })
}

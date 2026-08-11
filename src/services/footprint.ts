import { request } from "./request"

type FootprintCityCodesResponse = {
  city_codes: string[]
}

export async function listFootprintCityCodes(): Promise<string[]> {
  const data = await request<FootprintCityCodesResponse>({ path: "/api/footprint" })
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

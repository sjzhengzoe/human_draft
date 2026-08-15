import { request } from "./request"
import type { FootprintCityPlace, FootprintPlaceStatus } from "../types/api"

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

export async function listFootprintCityPlaces(
  cityCode: string
): Promise<FootprintCityPlace[]> {
  const data = await request<{ items: FootprintCityPlace[] }>({
    path: `/api/footprint/cities/${encodeURIComponent(cityCode)}/places`
  })
  return data.items
}

export async function createFootprintCityPlace(
  cityCode: string,
  input: { name: string; note: string; status: FootprintPlaceStatus }
): Promise<FootprintCityPlace> {
  const data = await request<{ item: FootprintCityPlace }>({
    path: `/api/footprint/cities/${encodeURIComponent(cityCode)}/places`,
    method: "POST",
    data: input
  })
  return data.item
}

export async function updateFootprintCityPlace(
  placeId: string,
  input: Partial<Pick<FootprintCityPlace, "name" | "note" | "status">>
): Promise<FootprintCityPlace> {
  const data = await request<{ item: FootprintCityPlace }>({
    path: `/api/footprint/places/${encodeURIComponent(placeId)}`,
    method: "PUT",
    data: input
  })
  return data.item
}

export async function deleteFootprintCityPlace(placeId: string): Promise<void> {
  await request<{ deleted: boolean }>({
    path: `/api/footprint/places/${encodeURIComponent(placeId)}`,
    method: "DELETE"
  })
}

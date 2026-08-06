export type DiningMode = "takeout" | "dine_in"

export type DiningScene = {
  id: string
  name: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type DiningPlace = {
  id: string
  name: string
  service_modes: DiningMode[]
  menu_items: string[]
  scene_id: string
  sort_order: number
  created_at: string
  updated_at: string
}

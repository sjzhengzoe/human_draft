export type LuggageItem = {
  id: string
  group_id: string
  name: string
  sort_order: number
}

export type LuggageGroup = {
  id: string
  scene_id: string
  name: string
  is_required: boolean
  sort_order: number
  items: LuggageItem[]
}

export type LuggageScene = {
  id: string
  name: string
  sort_order: number
  groups: LuggageGroup[]
}

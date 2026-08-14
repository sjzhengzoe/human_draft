export type WardrobeField = {
  id: string
  name: string
}

export type WardrobeCategory = {
  id: string
  name: string
  fields: WardrobeField[]
  sort_order: number
  created_at: string
  updated_at: string
}

export type WardrobeItem = {
  id: string
  category_id: string
  category: Pick<WardrobeCategory, "id" | "name" | "fields"> | null
  name: string
  image_path: string
  image_url: string
  values: Record<string, string>
  sort_order: number
  created_at: string
  updated_at: string
}

export type WardrobeSort = "created_desc" | "created_asc" | "custom"

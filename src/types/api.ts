export type ApiError = {
  code: string
  message: string
  details?: unknown
}

export type ApiEnvelope<T> = {
  ok: boolean
  data?: T
  error?: ApiError
}

export type AppUser = {
  uid: string
  display_name: string
  avatar_url: string
  can_write: boolean
  is_admin: boolean
  created_at: string
}

export type AuthSession = {
  token: string
  expires_at: string
  refresh_token: string
  refresh_expires_at: string
  user: AppUser
}

export type ImageStorageUsageModule = {
  key: string
  image_count: number
  used_bytes: number
}

export type ImageStorageUsage = {
  plan: "public_beta"
  used_bytes: number
  image_count: number
  quota_bytes: null
  modules: ImageStorageUsageModule[]
}

export type HomeModuleSettings = {
  configured: boolean
  hidden_module_keys: string[]
}

export type Category = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export type MealPeriod = "breakfast" | "lunch" | "afternoon_tea" | "dinner"
export type MenuRecordType = "home" | "outside"

export type MenuPlaceDishPreview = {
  id: string
  name: string
  introduction: string
  main_ingredients: string[]
  cooking_methods: string[]
  taste: string
  image_url: string
}

export type MenuPlace = {
  id: string
  name: string
  place_type: MenuRecordType
  outside_category_id: string | null
  outside_category: Pick<Category, "id" | "name"> | null
  image_path: string
  image_url: string
  sort_order: number
  dish_count: number
  dishes: MenuPlaceDishPreview[]
  preview_dishes: MenuPlaceDishPreview[]
  created_at: string
  updated_at: string
}

export type Dish = {
  id: string
  name: string
  record_type: MenuRecordType
  category_id: string | null
  category: Pick<Category, "id" | "name"> | null
  outside_category_id: string | null
  outside_category: Pick<Category, "id" | "name"> | null
  main_ingredients: string[]
  introduction: string
  cooking_methods: string[]
  taste: string
  flavor_options: string[]
  place_id: string | null
  place_sort_order: number
  image_path: string
  image_url: string
  meal_periods: MealPeriod[]
  printed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type DishSort = "created_desc" | "created_asc" | "custom"

export type DishListParams = {
  place_id?: string
  category_id?: string
  outside_category_id?: string
  record_type?: MenuRecordType
  printed?: boolean
  sort?: DishSort
  page?: number
  page_size?: number
}

export type MenuScheduleSourceKind = "dish" | "place"

export type MenuScheduleItem = {
  id: string
  source_kind: MenuScheduleSourceKind
  record_type: MenuRecordType
  dish_id: string | null
  place_id: string | null
  name: string
  place_name: string
  image_url: string
  place_image_url: string
  position: number
  archived: boolean
}

export type MenuScheduleMeal = {
  id: string
  meal_date: string
  meal_period: MealPeriod
  slot_count: number
  items: MenuScheduleItem[]
  created_at: string
  updated_at: string
}

export type MenuRankingItem = {
  key: string
  type: MenuScheduleSourceKind
  name: string
  image_url: string
  count: number
}

export type MenuFavorite = {
  id: string
  source_kind: MenuScheduleSourceKind
  dish_id: string | null
  place_id: string | null
  name: string
  record_type: MenuRecordType
  image_url: string
  sort_order: number
}

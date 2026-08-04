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
  id: string
  display_name: string
  avatar_url: string
  openid: string
  can_write: boolean
  is_admin: boolean
  created_at: string
}

export type AuthSession = {
  token: string
  expires_at: string
  user: AppUser
}

export type Category = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export type MealPeriod = "breakfast" | "lunch" | "dinner"
export type MenuRecordType = "home" | "outside"

export type Dish = {
  id: string
  name: string
  record_type: MenuRecordType
  category_id: string | null
  category: Pick<Category, "id" | "name"> | null
  outside_category_id: string | null
  outside_category: Pick<Category, "id" | "name"> | null
  recommended_items: string[]
  main_ingredients: string[]
  introduction: string
  cooking_methods: string[]
  taste: string
  flavor_options: string[]
  image_path: string
  thumbnail_path: string | null
  image_url: string
  thumbnail_url: string
  meal_periods: MealPeriod[]
  printed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type DishSort = "created_desc" | "created_asc" | "custom"

export type DishListParams = {
  category_id?: string
  outside_category_id?: string
  record_type?: MenuRecordType
  printed?: boolean
  sort?: DishSort
  page?: number
  page_size?: number
}

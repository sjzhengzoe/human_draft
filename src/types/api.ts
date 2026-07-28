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

export type Dish = {
  id: string
  name: string
  category_id: string
  category: Pick<Category, "id" | "name"> | null
  image_path: string
  thumbnail_path: string | null
  image_url: string
  thumbnail_url: string
  printed_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type DishSort = "created_desc" | "created_asc" | "custom"

export type DishListParams = {
  category_id?: string
  printed?: boolean
  sort?: DishSort
  page?: number
  page_size?: number
}

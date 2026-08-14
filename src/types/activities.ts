export type ActivityType = "室内" | "户外" | "居家"

export type ActivityItem = {
  id: string
  name: string
  introduction: string
  activity_type: ActivityType
  image_path: string | null
  image_url: string
  sort_order: number
  created_at: string
  updated_at: string
}

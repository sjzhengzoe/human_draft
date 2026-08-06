export type ActivityType = "室内" | "户外" | "居家"

export type ActivityItem = {
  id: string
  name: string
  activity_type: ActivityType
  sort_order: number
  created_at: string
  updated_at: string
}

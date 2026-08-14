export type KeyMomentGranularity = "year" | "month" | "day"

export type KeyMoment = {
  id: string
  content: string
  occurred_at: string
  image_path: string | null
  image_url: string
  created_at: string
  updated_at: string
}

export type KeyMomentTimelineItem = KeyMoment & {
  date_label: string
  time_label: string
  interval_after: string
  show_date_heading: boolean
  heading_day: string
  heading_month: string
  heading_year: string
}

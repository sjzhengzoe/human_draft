export type KeyMomentGranularity = "year" | "month" | "day"

export type KeyMoment = {
  id: string
  content: string
  occurred_at: string
  image_paths: string[]
  image_urls: string[]
  image_count: number
  created_at: string
  updated_at: string
}

export type KeyMomentPage = {
  items: KeyMoment[]
  has_more: boolean
  next_cursor: string
}

export type KeyMomentContext = {
  items: KeyMoment[]
  focus_index: number
  has_newer: boolean
  has_older: boolean
  newer_cursor: string
  older_cursor: string
}

export type KeyMomentDetailItem = KeyMoment & {
  date_label: string
  time_label: string
  single_image_style: string
}

export type KeyMomentTimelineItem = KeyMoment & {
  content_expandable: boolean
  content_expanded: boolean
  content_measurement_complete: boolean
  show_date_heading: boolean
  show_year_heading: boolean
  show_item_divider: boolean
  heading_day: string
  heading_month: string
  heading_time: string
  heading_year: string
}

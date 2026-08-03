export type ExerciseEmotion = "happy" | "neutral" | "unhappy" | "pitiful"
export type ExerciseBowlLevel = "full" | "normal" | "low" | "empty"
export type ExerciseCalendarDayState = "completed" | "incomplete" | "future" | "untracked"

export type ExerciseDashboard = {
  profile: {
    daily_minutes: number
    monthly_rest_days: number
  }
  today: {
    date: string
    completed: boolean
    daily_minutes: number
    daily_completed_minutes: number
    daily_pending_minutes: number
    recorded_minutes: number
    overachieved_minutes: number
    completed_minutes: number
    target_minutes: number
  }
  rest_days: {
    used: number
    total: number
    remaining: number
    used_today: boolean
  }
  month: {
    value: string
    year: number
    month: number
    days_in_month: number
    first_weekday: number
    is_current: boolean
    min_month: string
    max_month: string
    completed_days: number
    days: Array<{
      date: string
      day: number
      state: ExerciseCalendarDayState
      rest_used: boolean
      can_use_rest_day: boolean
    }>
  }
  cat: {
    food_ratio: number
    bowl_level: ExerciseBowlLevel
    bowl_label: string
    emotion: ExerciseEmotion
    emotion_label: string
    status_text: string
    pace_gap_minutes: number
  }
}

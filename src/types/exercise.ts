export type ExerciseEmotion = "happy" | "neutral" | "unhappy" | "pitiful"
export type ExerciseBowlLevel = "full" | "normal" | "low" | "empty"

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
    extra_minutes: number
    extra_completed_minutes: number
    extra_pending_minutes: number
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

export type ExerciseEmotion = "happy" | "neutral" | "unhappy" | "pitiful"
export type ExerciseBowlLevel = "full" | "normal" | "low" | "empty"

export type ExerciseDashboard = {
  profile: {
    daily_minutes: number
    monthly_rest_days: number
    credit_minutes: number
  }
  month: {
    month_start: string
    claimed: boolean
    claimed_at: string | null
    baseTaskMinutes: number
    extraTaskMinutes: number
    baseCompletedMinutes: number
    extraCompletedMinutes: number
    completedMinutes: number
    totalMinutes: number
    remainingMinutes: number
  }
  today: {
    date: string
    completed: boolean
    pending_minutes: number
    extra_pending_minutes: number
  }
  claim_preview: {
    minutes: number
    calendar_days: number
    exercise_days: number
    rest_days: number
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

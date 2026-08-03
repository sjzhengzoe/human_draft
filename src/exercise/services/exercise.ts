import type { ExerciseDashboard } from "../../types/exercise"
import { request } from "../../services/request"

export function getExerciseDashboard(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({ path: "/api/exercise" })
}

export function saveExerciseSettings(input: {
  daily_minutes: number
  monthly_rest_days: number
}): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/settings",
    method: "PUT",
    data: input
  })
}

export function resetExerciseState(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/reset",
    method: "POST"
  })
}

export function consumeExerciseRestDay(date: string): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/rest-day",
    method: "POST",
    data: { date }
  })
}

export function completeExercise(minutes: number): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/complete",
    method: "POST",
    data: { minutes }
  })
}

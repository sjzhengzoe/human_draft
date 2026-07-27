import type { ExerciseDashboard } from "../types/exercise"
import { request } from "./request"

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

export function claimExerciseMonth(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/monthly-claim",
    method: "POST"
  })
}

export function claimExerciseExtra(minutes: number): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/extra-claim",
    method: "POST",
    data: { minutes }
  })
}

export function completeExerciseDaily(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/daily-complete",
    method: "POST"
  })
}

export function completeExerciseExtra(minutes: number): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/extra-complete",
    method: "POST",
    data: { minutes }
  })
}

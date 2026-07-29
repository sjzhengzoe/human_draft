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

export function resetExerciseState(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/reset",
    method: "POST"
  })
}

export function claimExerciseMonth(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/monthly-claim",
    method: "POST"
  })
}

export function consumeExerciseRestDay(): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/rest-day",
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

export function completeExercise(minutes: number): Promise<ExerciseDashboard> {
  return request<ExerciseDashboard>({
    path: "/api/exercise/complete",
    method: "POST",
    data: { minutes }
  })
}

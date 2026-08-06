import {
  completeExerciseTasks,
  consumeExerciseRestDay,
  getExerciseDashboard,
  getExerciseRestCalendar,
  resetExerciseState,
  saveExerciseSettings
} from "../domains/exercise/service.mjs"

export function registerExerciseRoutes(app, context) {
  const { authenticated, getSupabaseAdmin } = context

  app.get("/api/exercise", { preHandler: authenticated }, async (request) => ({
    ok: true,
    data: await getExerciseDashboard(
      getSupabaseAdmin(),
      request.auth.user.id,
      new Date(),
      request.query?.month
    )
  }))

  app.get(
    "/api/exercise/rest-calendar",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await getExerciseRestCalendar(
        getSupabaseAdmin(),
        request.auth.user.id,
        new Date(),
        request.query?.month
      )
    })
  )

  app.put(
    "/api/exercise/settings",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await saveExerciseSettings(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.body || {}
      )
    })
  )

  app.post("/api/exercise/reset", { preHandler: authenticated }, async (request) => ({
    ok: true,
      data: await resetExerciseState(
        getSupabaseAdmin(),
        request.auth.user.id
    )
  }))

  app.post(
    "/api/exercise/rest-day",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await consumeExerciseRestDay(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.body || {}
      )
    })
  )

  app.post(
    "/api/exercise/complete",
    { preHandler: authenticated },
    async (request) => ({
      ok: true,
      data: await completeExerciseTasks(
        getSupabaseAdmin(),
        request.auth.user.id,
        request.body || {}
      )
    })
  )
}

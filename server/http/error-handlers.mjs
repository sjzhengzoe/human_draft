import { HttpError } from "../lib/errors.mjs"
import { shouldRecordOperationalError } from "./operational-events.mjs"

export function registerErrorHandlers(app, operationalEvents) {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "Not Found" }
    })
  })

  app.setErrorHandler(async (error, request, reply) => {
    if (!(error instanceof HttpError)) {
      request.log.error(error)
    } else if (error.cause) {
      request.log.error(error.cause)
    }

    const statusCode = error instanceof HttpError ? error.statusCode : error.statusCode || 500
    const code = error instanceof HttpError ? error.code : error.code || "INTERNAL_ERROR"
    const message =
      error instanceof HttpError
        ? error.message
        : statusCode === 413
          ? "上传文件过大。"
          : "服务器暂时无法处理请求。"

    const recorded = shouldRecordOperationalError(statusCode, code)
    if (recorded) {
      try {
        await operationalEvents.record({ request, error, statusCode, code, message })
      } catch (recordError) {
        request.log.error(recordError, "failed to persist operational event")
      }
    }

    reply.code(statusCode).send({
      ok: false,
      error: {
        code,
        message,
        ...(recorded ? { request_id: request.id } : {}),
        ...(error instanceof HttpError && error.details ? { details: error.details } : {})
      }
    })
  })
}

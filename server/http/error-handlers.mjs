import { HttpError } from "../lib/errors.mjs"

export function registerErrorHandlers(app) {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({
      ok: false,
      error: { code: "NOT_FOUND", message: "Not Found" }
    })
  })

  app.setErrorHandler((error, request, reply) => {
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

    reply.code(statusCode).send({
      ok: false,
      error: {
        code,
        message,
        ...(error instanceof HttpError && error.details ? { details: error.details } : {})
      }
    })
  })
}

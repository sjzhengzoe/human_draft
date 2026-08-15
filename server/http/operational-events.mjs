import { createHash } from "node:crypto";

const RECORDED_CODES = new Set([
  "IMAGE_STORAGE_QUOTA_EXCEEDED",
  "RATE_LIMITED",
  "REGISTRATION_CLOSED",
  "SYSTEM_READ_ONLY",
]);

const truncate = (value, length) => String(value || "").slice(0, length);

export function shouldRecordOperationalError(statusCode, code) {
  return statusCode >= 500 || RECORDED_CODES.has(code);
}

function eventCategory(code, statusCode) {
  if (code === "RATE_LIMITED") return "rate_limit";
  if (code === "IMAGE_STORAGE_QUOTA_EXCEEDED") return "storage_quota";
  if (code === "REGISTRATION_CLOSED" || code === "SYSTEM_READ_ONLY") {
    return "runtime_control";
  }
  return statusCode >= 500 ? "server_error" : "request_error";
}

function safeDetails(error) {
  const cause = error?.cause;
  const stackFrames = String(error?.stack || "")
    .split("\n")
    .slice(1)
    .join("\n");
  return {
    error_name: truncate(error?.name, 120),
    cause_name: truncate(cause?.name, 120),
    cause_code: truncate(cause?.code, 120),
    stack_frames: truncate(stackFrames, 4_000),
  };
}

export function createOperationalEventRecorder(getSupabaseAdmin, options = {}) {
  const enabled = options.enabled ?? true;
  let lastCleanupAt = 0;

  async function record({ request, error, statusCode, code, message }) {
    if (!enabled || !shouldRecordOperationalError(statusCode, code)) return;
    const route = truncate(request.routeOptions?.url || request.url?.split("?")[0], 500);
    const category = eventCategory(code, statusCode);
    const fingerprint = createHash("sha256")
      .update([request.method, route, code, error?.cause?.code || ""].join("|"))
      .digest("hex");
    const now = new Date();
    const { error: recordError } = await getSupabaseAdmin().rpc("record_operational_event", {
      p_fingerprint: fingerprint,
      p_bucket_started_at: now.toISOString(),
      p_request_id: truncate(request.id, 120),
      p_severity: statusCode >= 500 ? "error" : "warning",
      p_category: category,
      p_error_code: truncate(code, 120),
      p_method: truncate(request.method, 12),
      p_route: route,
      p_status_code: statusCode,
      p_uid: request.auth?.user?.uid || null,
      p_message: truncate(message, 1_000),
      p_details: safeDetails(error),
    });
    if (recordError) throw recordError;

    if (Date.now() - lastCleanupAt >= 24 * 60 * 60 * 1000) {
      lastCleanupAt = Date.now();
      const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { error: cleanupError } = await getSupabaseAdmin().rpc(
        "cleanup_operational_events",
        { p_cutoff: cutoff },
      );
      if (cleanupError) throw cleanupError;
    }
  }

  return { record };
}

export function createNoopOperationalEventRecorder() {
  return { async record() {} };
}

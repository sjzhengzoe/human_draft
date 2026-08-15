import { HttpError } from "../lib/errors.mjs";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class FixedWindowRateLimiter {
  constructor({ maxEntries = 10_000 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
    this.operations = 0;
  }

  consume(key, { limit, windowMs }, now = Date.now()) {
    this.operations += 1;
    if (this.operations % 200 === 0) this.cleanup(now);
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      this.entries.set(key, entry);
    }
    entry.count += 1;
    if (this.entries.size > this.maxEntries) this.evictOldest();
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }

  cleanup(now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  evictOldest() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) return;
      this.entries.delete(oldestKey);
    }
  }
}

function rejectRateLimit(reply, result, message) {
  if (result.allowed) return;
  reply.header("Retry-After", String(result.retryAfterSeconds));
  throw new HttpError(429, "RATE_LIMITED", message, {
    retry_after_seconds: result.retryAfterSeconds,
  });
}

export function createRequestRateLimiter(options = {}) {
  const limiter = options.limiter || new FixedWindowRateLimiter();
  const enabled = options.enabled ?? true;

  function enforceIp(request, reply) {
    if (!enabled || !request.url.startsWith("/api/")) return;
    const ip = request.ip || "unknown";
    rejectRateLimit(
      reply,
      limiter.consume(`ip:all:${ip}`, { limit: 600, windowMs: 60_000 }),
      "请求过于频繁，请稍后再试。",
    );
    if (request.url.startsWith("/api/auth/wechat")) {
      rejectRateLimit(
        reply,
        limiter.consume(`ip:login:${ip}`, { limit: 12, windowMs: 5 * 60_000 }),
        "登录尝试过于频繁，请稍后再试。",
      );
    }
    if (request.url.startsWith("/api/auth/refresh")) {
      rejectRateLimit(
        reply,
        limiter.consume(`ip:refresh:${ip}`, { limit: 30, windowMs: 5 * 60_000 }),
        "登录刷新过于频繁，请稍后再试。",
      );
    }
  }

  function enforceAuthenticated(request, reply) {
    if (!enabled || !request.auth?.user?.uid) return;
    const uid = request.auth.user.uid;
    if (request.isMultipart?.()) {
      rejectRateLimit(
        reply,
        limiter.consume(`uid:upload:${uid}`, { limit: 30, windowMs: 10 * 60_000 }),
        "图片上传过于频繁，请稍后再试。",
      );
    }
    if (MUTATING_METHODS.has(request.method)) {
      rejectRateLimit(
        reply,
        limiter.consume(`uid:write:${uid}`, { limit: 180, windowMs: 60_000 }),
        "操作过于频繁，请稍后再试。",
      );
    }
  }

  return { enforceAuthenticated, enforceIp, limiter };
}

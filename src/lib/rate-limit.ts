export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;
const DEFAULT_WINDOW_MS = 60_000;

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitDecision {
  // Keep the limiter fail-closed for malformed runtime input. The public API
  // remains unchanged, but NaN/Infinity/zero must not disable enforcement.
  const safeLimit = normalizePositiveInteger(limit, 1);
  const safeWindowMs = normalizePositiveInteger(windowMs, DEFAULT_WINDOW_MS);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + safeWindowMs;
    buckets.set(key, { count: 1, resetAt });
    pruneBuckets(now);
    return { allowed: true, limit: safeLimit, remaining: Math.max(0, safeLimit - 1), resetAt };
  }

  current.count += 1;
  return {
    allowed: current.count <= safeLimit,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - current.count),
    resetAt: current.resetAt,
  };
}

function normalizePositiveInteger(value: number, fallback: number) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function pruneBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // Bound memory even when an attacker supplies many unique keys and all
  // active buckets have not expired yet. This is local-process limiting only;
  // it is not distributed across workers/instances without an existing store.
  while (buckets.size > MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

export function getClientAddress(headers: Headers) {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ??
    "unknown"
  );
}

export function rateLimitCategory(pathname: string, method: string) {
  if (pathname.startsWith("/api/ai/")) return { name: "ai", limit: 12, windowMs: 60_000 };
  if (pathname === "/api/wa-webhook") return { name: "webhook", limit: 300, windowMs: 60_000 };
  if (pathname.startsWith("/api/jobs/")) return { name: "job", limit: 60, windowMs: 60_000 };
  if (pathname.startsWith("/api/") && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return { name: "mutation", limit: 120, windowMs: 60_000 };
  }
  return null;
}

export function rateLimitHeaders(decision: RateLimitDecision) {
  return {
    "X-RateLimit-Limit": String(decision.limit),
    "X-RateLimit-Remaining": String(decision.remaining),
    "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
    ...(decision.allowed ? {} : { "Retry-After": String(Math.max(1, Math.ceil((decision.resetAt - Date.now()) / 1000))) }),
  };
}

export function resetRateLimitStore() {
  buckets.clear();
}

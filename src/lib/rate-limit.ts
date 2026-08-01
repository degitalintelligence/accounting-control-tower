export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitDecision {
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    pruneBuckets(now);
    return { allowed: true, limit, remaining: Math.max(0, limit - 1), resetAt };
  }

  current.count += 1;
  return {
    allowed: current.count <= limit,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  };
}

function pruneBuckets(now: number) {
  if (buckets.size <= MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now || buckets.size > MAX_BUCKETS) buckets.delete(key);
    if (buckets.size <= MAX_BUCKETS) break;
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

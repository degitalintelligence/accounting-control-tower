import { describe, expect, it, beforeEach } from "vitest";
import { consumeRateLimit, rateLimitCategory, resetRateLimitStore } from "@/lib/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => resetRateLimitStore());

  it("allows the configured number of requests and rejects the next one", () => {
    expect(consumeRateLimit("test", 2, 1_000, 0).allowed).toBe(true);
    expect(consumeRateLimit("test", 2, 1_000, 1).allowed).toBe(true);
    expect(consumeRateLimit("test", 2, 1_000, 2).allowed).toBe(false);
  });

  it("starts a fresh window after reset", () => {
    expect(consumeRateLimit("test", 1, 1_000, 0).allowed).toBe(true);
    expect(consumeRateLimit("test", 1, 1_000, 1).allowed).toBe(false);
    expect(consumeRateLimit("test", 1, 1_000, 1_001).allowed).toBe(true);
  });

  it("classifies protected route groups", () => {
    expect(rateLimitCategory("/api/ai/insights", "GET")?.name).toBe("ai");
    expect(rateLimitCategory("/api/wa-webhook", "POST")?.name).toBe("webhook");
    expect(rateLimitCategory("/api/jobs/notifications", "POST")?.name).toBe("job");
    expect(rateLimitCategory("/api/projects", "POST")?.name).toBe("mutation");
    expect(rateLimitCategory("/api/dashboard/stats", "GET")).toBeNull();
  });
});

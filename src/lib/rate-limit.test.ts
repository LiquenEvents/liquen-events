import { describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";
import { clientIp, rateLimit, sweep } from "./rate-limit";

function reqWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("clientIp", () => {
  it("takes the first IP from x-forwarded-for and trims it", () => {
    const req = reqWith({ "x-forwarded-for": " 203.0.113.7 , 70.41.3.18 " });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when there is no forwarded-for", () => {
    expect(clientIp(reqWith({ "x-real-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });

  it("returns 'unknown' when no IP headers are present", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  let seq = 0;
  // Unique key per call so the module-level bucket map can't leak across tests.
  const uniqueKey = () => `rl-${Date.now()}-${seq++}`;

  it("allows calls up to the limit, then throttles with a positive retryAfter", () => {
    const k = uniqueKey();
    expect(rateLimit(k, 3).ok).toBe(true);
    expect(rateLimit(k, 3).ok).toBe(true);
    expect(rateLimit(k, 3).ok).toBe(true);
    const blocked = rateLimit(k, 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("treats each key independently", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    expect(rateLimit(a, 1).ok).toBe(true);
    expect(rateLimit(a, 1).ok).toBe(false);
    // A different key still has its full allowance.
    expect(rateLimit(b, 1).ok).toBe(true);
  });

  it("resets the window once it has elapsed", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const k = "reset-key";
      expect(rateLimit(k, 1, 1000).ok).toBe(true);
      expect(rateLimit(k, 1, 1000).ok).toBe(false);
      vi.setSystemTime(1001); // past resetAt (0 + 1000)
      expect(rateLimit(k, 1, 1000).ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports retryAfter as the ceiling of the remaining window in seconds", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(0);
      const k = "retry-key";
      rateLimit(k, 1, 5000);
      const blocked = rateLimit(k, 1, 5000);
      expect(blocked.ok).toBe(false);
      expect(blocked.retryAfter).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("sweep", () => {
  it("is safe to call and never throws", () => {
    expect(() => sweep()).not.toThrow();
  });
});

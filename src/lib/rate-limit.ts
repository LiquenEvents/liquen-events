import type { NextRequest } from "next/server";

/**
 * Lightweight in-memory rate limiter for public endpoints (anti-spam).
 *
 * Best-effort: on serverless each instance keeps its own window, so this is
 * a first line of defence, not a hard guarantee. For strict limits across
 * instances, back it with a shared store (e.g. Upstash) later.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns `{ ok: true }` if the caller is within the limit, or
 * `{ ok: false, retryAfter }` (seconds) when it should be throttled.
 */
export function rateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000
): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count++;
  return { ok: true };
}

// Opportunistic cleanup so the map can't grow unbounded.
let lastSweep = 0;
export function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}

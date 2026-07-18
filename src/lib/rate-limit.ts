import "server-only";
import type { NextRequest } from "next/server";

/**
 * Rate limiter for public endpoints (anti-spam).
 *
 * Uses Upstash Redis (via its REST API — no SDK dependency) when configured, so
 * the limit holds ACROSS serverless instances; otherwise falls back to a fast
 * in-memory limiter (per instance). Redis errors fail OPEN to the in-memory
 * path — a cache outage must never take the site's forms down.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(req: NextRequest): string {
  // Prefer headers the hosting platform sets itself (Vercel overwrites these
  // per request); a client-supplied x-forwarded-for is trivially forged and
  // would let a bot rotate "IPs" past the rate limit, so it comes last.
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

interface RateResult {
  ok: boolean;
  retryAfter?: number;
}

// ── In-memory limiter (per instance) — default & fallback ──
function memoryRateLimit(key: string, limit: number, windowMs: number): RateResult {
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

// ── Distributed limiter via Upstash Redis REST ──
// One pipelined round-trip: INCR (atomic) + PEXPIRE (sliding window). Throws on
// any failure so the caller can degrade to the in-memory limiter.
async function redisRateLimit(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["PEXPIRE", key, String(windowMs)],
    ]),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result?: number }>;
  const count = Number(data?.[0]?.result ?? 0);
  return count > limit ? { ok: false, retryAfter: Math.ceil(windowMs / 1000) } : { ok: true };
}

/**
 * Returns `{ ok: true }` if the caller is within the limit, or
 * `{ ok: false, retryAfter }` (seconds) when it should be throttled.
 */
export async function rateLimit(key: string, limit = 5, windowMs = 60_000): Promise<RateResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      return await redisRateLimit(url, token, key, limit, windowMs);
    } catch {
      return memoryRateLimit(key, limit, windowMs); // fail open
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}

// Opportunistic cleanup so the in-memory map can't grow unbounded.
let lastSweep = 0;
export function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}

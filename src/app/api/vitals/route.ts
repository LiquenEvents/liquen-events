import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/logger";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Real-user Web Vitals collector. The client (components/WebVitals) beacons one
 * record per finalized metric (LCP, CLS, INP, TTFB, FCP) with its Google
 * "good / needs-improvement / poor" rating and the page it happened on. We log
 * a small, fixed set of fields via the app logger so real-world fluidity in the
 * field — not just the lab (Lighthouse + the Playwright harness) — is
 * observable. Public by necessity (browsers post here): rate-limited, strictly
 * validated, never echoes anything back.
 */
const VitalSchema = z.object({
  name: z.enum(["LCP", "CLS", "INP", "TTFB", "FCP"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  path: z.string().max(256).optional(),
  nav: z.string().max(32).optional(), // navigationType (navigate/reload/back_forward/prerender)
  conn: z.string().max(16).optional(), // effectiveType (4g/3g/…)
});

export async function POST(req: NextRequest) {
  sweep();
  // A page can send up to ~5 metrics; allow a comfortable burst per client.
  if (!(await rateLimit(`vitals:${clientIp(req)}`, 40, 60_000)).ok) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const parsed = VitalSchema.safeParse(await req.json().catch(() => null));
    if (parsed.success) {
      const v = parsed.data;
      // CLS is unitless; the rest are milliseconds. Round to keep logs tidy.
      const value = v.name === "CLS" ? Number(v.value.toFixed(4)) : Math.round(v.value);
      log.info("web-vital", {
        metric: v.name,
        value,
        rating: v.rating,
        path: v.path,
        nav: v.nav,
        conn: v.conn,
      });
    }
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}

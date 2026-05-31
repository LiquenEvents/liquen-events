import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Collects browser CSP violation reports (report-uri target). Useful to detect
 * injection attempts and to safely tighten the policy over time. Public by
 * necessity (browsers post here), so it's rate-limited and only logs a small,
 * fixed set of fields — never echoes anything back.
 */
export async function POST(req: NextRequest) {
  sweep();
  if (!rateLimit(`csp:${clientIp(req)}`, 30, 60_000).ok) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const r = (body?.["csp-report"] ?? body ?? {}) as Record<string, unknown>;
    log.warn("CSP violation", {
      documentUri: r["document-uri"] ?? r["documentURL"],
      violatedDirective: r["violated-directive"] ?? r["effectiveDirective"],
      blockedUri: r["blocked-uri"] ?? r["blockedURL"],
    });
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}

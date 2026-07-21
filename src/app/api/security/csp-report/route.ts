import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Log one violation record, tolerant of the legacy (kebab-case) and modern
 *  Reporting API (camelCase, nested under `.body`) field names. */
function logViolation(r: Record<string, unknown>) {
  log.warn("CSP violation", {
    documentUri: r["document-uri"] ?? r["documentURL"],
    violatedDirective: r["violated-directive"] ?? r["effectiveDirective"],
    blockedUri: r["blocked-uri"] ?? r["blockedURL"],
  });
}

/**
 * Collects browser CSP violation reports. Handles BOTH wire formats: the legacy
 * report-uri body ({ "csp-report": {...} }, content-type application/csp-report)
 * and the modern report-to / Reporting API body (an array of
 * { type, body: {...} }, content-type application/reports+json). Useful to detect
 * injection attempts and to safely tighten the policy over time. Public by
 * necessity (browsers post here), so it's rate-limited and only logs a small,
 * fixed set of fields — never echoes anything back.
 */
export async function POST(req: NextRequest) {
  sweep();
  if (!(await rateLimit(`csp:${clientIp(req)}`, 30, 60_000)).ok) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    if (Array.isArray(body)) {
      // Modern Reporting API: an array of reports; CSP ones carry the violation
      // under `.body`. Ignore other report types that may share the endpoint.
      for (const item of body) {
        const rec = item as Record<string, unknown>;
        if (rec?.["type"] && rec["type"] !== "csp-violation") continue;
        logViolation((rec?.["body"] ?? rec) as Record<string, unknown>);
      }
    } else {
      const obj = (body ?? {}) as Record<string, unknown>;
      logViolation((obj["csp-report"] ?? obj) as Record<string, unknown>);
    }
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}

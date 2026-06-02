import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge security proxy (Next.js 16 — formerly middleware).
 *
 * Two jobs, both scoped to /api/:path* :
 *
 * 1. CSRF defence in depth: state-changing API calls (POST/PUT/PATCH/DELETE)
 *    must originate from our own site. Browsers always attach an `Origin`
 *    header to cross-site form posts and fetches, so if `Origin` is present and
 *    its host doesn't match the request host, we reject it. Same-origin
 *    requests pass, and server-to-server callers (no `Origin`, e.g. the cron
 *    job) are allowed and gated by their own secret. This complements the
 *    SameSite=Lax session cookie.
 *
 * 2. Request-ID injection: every API response carries an `X-Request-ID` so the
 *    team can correlate browser error messages with log entries. A caller's own
 *    `X-Request-ID` (e.g. an uptime monitor) is echoed back unchanged, and the
 *    ID is forwarded on the incoming request for route handlers to read.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("host");
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* malformed Origin → treat as mismatch */
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
      }
    }
  }

  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: "/api/:path*",
};

import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge security & i18n proxy (Next.js 16 — formerly middleware).
 *
 * 1. English mirror URLs (/en, /en/*): the site is Portuguese-first, but to let
 *    search engines discover & index the English version we expose it under a
 *    stable, crawlable URL. We rewrite /en/<path> to <path> and force the locale
 *    via the `x-liquen-locale` request header (read by getLocale). A sticky
 *    `liquen-lang` cookie keeps in-page navigation — which drops the /en prefix
 *    — in English too. Portuguese URLs are untouched and stay canonical.
 *
 * 2. CSRF defence in depth (state-changing /api calls): browsers attach an
 *    `Origin` header to cross-site posts, so a present-but-mismatched Origin is
 *    rejected. Same-origin and server-to-server (no Origin) callers pass.
 *
 * 3. Request-ID injection: every /api response carries an `X-Request-ID` for
 *    correlating browser errors with log entries.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. English mirror (/en, /en/*) ──
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/en" ? "/" : pathname.slice(3); // drop "/en"
    const headers = new Headers(req.headers);
    headers.set("x-liquen-locale", "en");
    const res = NextResponse.rewrite(url, { request: { headers } });
    res.cookies.set("liquen-lang", "en", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
    return res;
  }

  // ── 2. CSRF defence (mutating /api) ──
  if (pathname.startsWith("/api/") && MUTATING.has(req.method)) {
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

  // ── 3. Request-ID injection ──
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/en", "/en/:path*"],
};

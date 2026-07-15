import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge security & i18n proxy (Next.js 16 — formerly middleware).
 *
 * The marketing pages live under an internal `[lang]` route segment
 * (`/pt/*`, `/en/*`) so they can be **statically prerendered** — the locale
 * comes from the route, not a runtime header/cookie. The public URL scheme is
 * unchanged: Portuguese is canonical at the bare path (`/`, `/servicos`, …) and
 * English lives at `/en/*` (shareable & crawlable). This proxy maps public URLs
 * onto the internal segments:
 *
 *  1. `/en`, `/en/*` — already the `[lang=en]` segment; served as-is. A sticky
 *     `liquen-lang` cookie records the choice on real document navigations.
 *  2. `/pt`, `/pt/*` — the internal Portuguese prefix must never be public;
 *     redirect it to the canonical bare URL (avoids duplicate content).
 *  3. Bare canonical paths — rewritten onto `/{lang}/…` (URL stays bare); the
 *     language follows the sticky cookie, defaulting to Portuguese. Rewrites
 *     don't re-enter the proxy, so there's no loop and the `/pt/*` redirect
 *     above only ever fires for genuinely external `/pt` requests.
 *
 *  4. CSRF defence in depth (state-changing /api): a present-but-mismatched
 *     Origin is rejected; same-origin and server-to-server callers pass.
 *  5. Request-ID injection on /api for correlating errors with logs.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LANG_COOKIE = "liquen-lang";

/**
 * Paths that must NOT be locale-rewritten: framework internals, the special
 * metadata routes that live at the app root (sitemap/robots/manifest/icons),
 * static asset folders, and anything with a file extension.
 */
function isNonLocalized(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname.startsWith("/imagens/") ||
    pathname.startsWith("/logos/") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── /api: CSRF defence + request-id (unchanged behaviour) ──
  if (pathname.startsWith("/api/")) {
    if (MUTATING.has(req.method)) {
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
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("X-Request-ID", requestId);
    return res;
  }

  // ── Metadata files / assets pass straight through ──
  if (isNonLocalized(pathname)) return NextResponse.next();

  // ── Internal Portuguese prefix leaked to a public URL → canonicalise ──
  if (pathname === "/pt" || pathname.startsWith("/pt/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/";
    return NextResponse.redirect(url, 308);
  }

  // ── English mirror: already the [lang=en] segment; stick the choice ──
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const res = NextResponse.next();
    // Only on real document navigations that don't already carry the cookie —
    // prefetches and background RSC fetches must stay side-effect free so they
    // can't clobber a fresh "pt" the toggle just wrote.
    const dest = req.headers.get("sec-fetch-dest");
    const isDocument = dest ? dest === "document" : !req.headers.get("rsc");
    if (isDocument && req.cookies.get(LANG_COOKIE)?.value !== "en") {
      res.cookies.set(LANG_COOKIE, "en", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  }

  // ── Bare canonical path → rewrite onto the internal /{lang} segment ──
  const lang = req.cookies.get(LANG_COOKIE)?.value === "en" ? "en" : "pt";
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Run on everything except Next's static output; the function itself lets
  // metadata files and assets through untouched (see isNonLocalized).
  matcher: ["/((?!_next/static|_next/image).*)"],
};

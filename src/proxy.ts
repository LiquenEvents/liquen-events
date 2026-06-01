import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge security proxy (Next.js 16 — formerly middleware).
 *
 * 1. CSRF: reject cross-origin state-changing API calls.
 * 2. Admin gate: short-circuit admin-only API paths without hitting Node.js
 *    route handlers (defence in depth; routes still verify independently).
 * 3. Request ID: inject x-request-id on every request for distributed tracing.
 */

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ADMIN_COOKIE = process.env.NODE_ENV === "production" ? "__Host-liquen_admin" : "liquen_admin";

// Paths that require a valid admin session — public paths are excluded.
// NOTE: keep in sync with isAuthed() checks in the route handlers (belt + suspenders).
const ADMIN_ONLY_PREFIXES = [
  "/api/admin/logout",
  "/api/backup",
  "/api/tarefas",
  "/api/fornecedores",
  "/api/propostas",
  "/api/inbox",
  "/api/calendario",
  "/api/orcamento/manual",
];

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  return s && s.length >= 16 ? s : "liquen-dev-session-secret-change-me";
}

function isValidSession(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return false;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!body || !sig) return false;

  const expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── 1. CSRF: block cross-origin mutating requests ──────────────────────────
  if (pathname.startsWith("/api/") && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("host");
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* malformed Origin → reject */
      }
      if (!originHost || originHost !== host) {
        return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
      }
    }
  }

  // ── 2. Admin gate: protect admin-only API routes before route handlers run ─
  if (ADMIN_ONLY_PREFIXES.some((p) => pathname.startsWith(p))) {
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    if (!isValidSession(token)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  // ── 3. Request ID: forward for structured logging & tracing ───────────────
  const requestId = randomUUID();
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  matcher: [
    // All paths except Next.js build output and static public assets
    "/((?!_next/static|_next/image|favicon\\.ico|imagens|logos|icons|manifest|sw\\.js).*)",
  ],
};

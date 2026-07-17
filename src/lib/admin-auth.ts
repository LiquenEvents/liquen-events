import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { verifyTotp } from "./totp";
import { log } from "./logger";

/**
 * Admin authentication for the internal dashboard.
 *
 * Design:
 *  - Passwords are verified against bcrypt hashes — never compared in plaintext
 *    and never stored in the browser.
 *  - A successful login mints an HMAC-signed session token (payload + signature)
 *    with an expiry, stored in an httpOnly cookie. The token is tamper-proof:
 *    changing the name or expiry invalidates the signature.
 *  - Accounts are configurable via env, with a dev-friendly shared-password
 *    fallback so local work needs zero setup.
 *
 * Env:
 *  - SESSION_SECRET     HMAC key for sessions (required in production).
 *  - ADMIN_USERS        JSON array of individual accounts:
 *                       [{"name":"Catarina","passwordHash":"$2b$10$..."}]
 *  - ADMIN_PASSWORD_HASH bcrypt hash for the shared-password fallback.
 */
// In production the session cookie uses the __Host- prefix: the browser then
// guarantees it was set with Secure, Path=/ and no Domain — preventing cookie
// injection/fixation from subdomains or non-HTTPS origins. (Dev is plain HTTP,
// where __Host- cookies are rejected, so we only prefix in production.)
export const ADMIN_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-liquen_admin" : "liquen_admin";
export const ADMIN_NAME_COOKIE = "liquen_user";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

// Global session revocation. Tokens embed the version they were minted with;
// bumping SESSION_VERSION (any new string) invalidates EVERY outstanding
// session at once — the recovery lever for a leaked cookie or a departure,
// without having to rotate SESSION_SECRET. Tokens minted before this claim
// existed count as version "1".
function sessionVersion(): string {
  return process.env.SESSION_VERSION || "1";
}

// bcrypt hash of "liquen2026" — the dev/default shared password. Override in
// production with ADMIN_PASSWORD_HASH (or switch to per-user ADMIN_USERS).
const DEV_SHARED_HASH = "$2b$10$eSAkm9hz/JUpFYWRdPrA9.YJP.Gjry2IwVwgZa3hjvHcvV/r27n7u";

// --- Secret ---------------------------------------------------------------
// Last-resort key when production is fully misconfigured. Random per process so
// session tokens can NEVER be forged with a known/public value (see below).
let randomFallbackSecret: string | null = null;

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (hash) {
      // Don't lock the team out: derive a stable, NON-public key from the
      // (secret) configured password hash. Still — set a real SESSION_SECRET.
      log.error(
        "auth: SESSION_SECRET não definido (ou demasiado curto) em produção — a derivar do ADMIN_PASSWORD_HASH; defina um SESSION_SECRET aleatório de 32+ caracteres",
      );
      return `derived:${hash}`;
    }
    // Neither SESSION_SECRET nor ADMIN_PASSWORD_HASH is set: login is already
    // disabled (sharedHash() === null), so there are no real sessions to keep.
    // Use a random per-process key — NEVER the public, committed DEV_SHARED_HASH,
    // which would let anyone forge a valid admin session cookie.
    if (!randomFallbackSecret) {
      randomFallbackSecret = randomBytes(32).toString("base64url");
      log.error(
        "auth: SESSION_SECRET e ADMIN_PASSWORD_HASH ausentes em produção — login de admin desativado; a usar chave de sessão aleatória por processo",
      );
    }
    return randomFallbackSecret;
  }
  return "liquen-dev-session-secret-change-me";
}

// --- Accounts -------------------------------------------------------------
interface AdminUser {
  name: string;
  passwordHash: string;
  totpSecret?: string;
}

function configuredUsers(): AdminUser[] | null {
  const raw = process.env.ADMIN_USERS;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.length > 0 &&
      parsed.every((u) => typeof u?.name === "string" && typeof u?.passwordHash === "string")
    ) {
      return parsed;
    }
    log.error("auth: ADMIN_USERS tem um formato inesperado; ignorado");
  } catch {
    log.error("auth: ADMIN_USERS não é JSON válido; ignorado");
  }
  return null;
}

/**
 * The bcrypt hash the shared-password fallback checks against. In production we
 * NEVER fall back to the public dev hash: if neither ADMIN_PASSWORD_HASH nor
 * ADMIN_USERS is configured, return null so login is refused outright (the dev
 * password "liquen2026" is committed and therefore public knowledge).
 */
function sharedHash(): string | null {
  if (process.env.ADMIN_PASSWORD_HASH) return process.env.ADMIN_PASSWORD_HASH;
  if (process.env.NODE_ENV === "production") {
    log.error(
      "auth: sem ADMIN_PASSWORD_HASH nem ADMIN_USERS em produção — login de admin desativado",
    );
    return null;
  }
  return DEV_SHARED_HASH;
}

// ── Two-factor (TOTP) ──────────────────────────────────────────────────────
function totpSecretFor(name: string): string | null {
  const users = configuredUsers();
  if (users) {
    const u = users.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (u?.totpSecret) return u.totpSecret;
  }
  return process.env.ADMIN_TOTP_SECRET || null;
}

/** Whether the given user must provide a 2FA code (a TOTP secret is configured). */
export function totpRequired(name: string): boolean {
  return totpSecretFor(name) !== null;
}

/** Verify a 2FA code for the user. Returns true when no 2FA is configured. */
export function checkTotp(name: string, code: string): boolean {
  const secret = totpSecretFor(name);
  if (!secret) return true;
  return verifyTotp(secret, code);
}

/**
 * Verify a login attempt. With ADMIN_USERS configured, matches the named
 * account's own password (true individual accounts). Otherwise falls back to a
 * single shared password accepted with any display name (current UX).
 * Returns the resolved user, or null when credentials are wrong.
 */
// Async + lazy `import("bcryptjs")`: bcrypt is ONLY needed here (the login POST),
// yet this module is also imported by hot, mostly-unauthenticated paths — the
// health probe and the public /api/orcamento route both pull in `isAuthed`
// from here. Keeping bcryptjs out of the top-level import means those paths no
// longer pay to load it; the login route (the sole caller) absorbs one await.
export async function verifyCredentials(
  name: string,
  password: string,
): Promise<{ name: string } | null> {
  if (!password) return null;
  const cleanName = name.trim().slice(0, 40);
  const { compareSync } = (await import("bcryptjs")).default;

  const users = configuredUsers();
  if (users) {
    const u = users.find((x) => x.name.toLowerCase() === cleanName.toLowerCase());
    if (u && compareSync(password, u.passwordHash)) return { name: u.name };
    // Unknown name: still run one bcrypt compare so the response time doesn't
    // reveal whether the admin display-name exists (username enumeration).
    if (!u) compareSync(password, DEV_SHARED_HASH);
    return null;
  }

  const hash = sharedHash();
  if (hash && compareSync(password, hash)) {
    return { name: cleanName || "Equipa" };
  }
  return null;
}

// --- Sessions -------------------------------------------------------------
function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

/** Mint a signed, expiring session token for the given user name. */
export function createSession(name: string): string {
  const payload = { sub: name.slice(0, 40), exp: Date.now() + SESSION_TTL_MS, v: sessionVersion() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Validate a session token; returns the user name or null if invalid/expired. */
export function readSession(token: string | undefined | null): { name: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    // Revoked generation? Tokens minted before the claim existed are "1".
    if (String(payload.v ?? "1") !== sessionVersion()) return null;
    return { name: String(payload.sub ?? "") };
  } catch {
    return null;
  }
}

/** True when the request carries a valid, unexpired admin session cookie. */
export function isAuthed(req: NextRequest): boolean {
  return readSession(req.cookies.get(ADMIN_COOKIE)?.value) !== null;
}

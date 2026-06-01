import { createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { verifyTotp } from "./totp";

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

// bcrypt hash of "liquen2026" — the dev/default shared password. Override in
// production with ADMIN_PASSWORD_HASH (or switch to per-user ADMIN_USERS).
const DEV_SHARED_HASH = "$2b$10$eSAkm9hz/JUpFYWRdPrA9.YJP.Gjry2IwVwgZa3hjvHcvV/r27n7u";

// --- Secret ---------------------------------------------------------------
function sessionSecret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    // Don't lock the team out of their own dashboard: derive a stable key from
    // the configured password hash, but make the misconfiguration loud.
    console.error(
      "[auth] SESSION_SECRET is not set (or too short) in production. " +
        "Set a random 32+ char SESSION_SECRET so sessions survive credential changes.",
    );
    return `derived:${process.env.ADMIN_PASSWORD_HASH ?? DEV_SHARED_HASH}`;
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
    console.error("[auth] ADMIN_USERS has an unexpected shape; ignoring.");
  } catch {
    console.error("[auth] ADMIN_USERS is not valid JSON; ignoring.");
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
    console.error(
      "[auth] No ADMIN_PASSWORD_HASH or ADMIN_USERS configured in production — " +
        "admin login is disabled. Set one of them to enable the dashboard.",
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
export function verifyCredentials(name: string, password: string): { name: string } | null {
  if (!password) return null;
  const cleanName = name.trim().slice(0, 40);

  const users = configuredUsers();
  if (users) {
    const u = users.find((x) => x.name.toLowerCase() === cleanName.toLowerCase());
    if (u && bcrypt.compareSync(password, u.passwordHash)) return { name: u.name };
    return null;
  }

  const hash = sharedHash();
  if (hash && bcrypt.compareSync(password, hash)) {
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
  const payload = { sub: name.slice(0, 40), exp: Date.now() + SESSION_TTL_MS };
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
    return { name: String(payload.sub ?? "") };
  } catch {
    return null;
  }
}

/** True when the request carries a valid, unexpired admin session cookie. */
export function isAuthed(req: NextRequest): boolean {
  return readSession(req.cookies.get(ADMIN_COOKIE)?.value) !== null;
}

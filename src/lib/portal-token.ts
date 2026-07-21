import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { log } from "./logger";

/**
 * Signed tokens for the public "Portal do Cliente" links — the single window a
 * client has into their booking (proposta, contrato, faturas, faseamento).
 *
 * Same wire format as the proposal accept links (src/lib/proposal-token.ts):
 * an HMAC over a base64url payload, tamper-proof and unguessable, so a link
 * only ever opens the exact quote it was minted for — no id enumeration, no way
 * to forge access to another client's booking.
 *
 * Domain separation: the payload carries `typ: "portal"`, so a portal link can
 * never be replayed as a proposal accept link (typ:"proposal") or an admin
 * session (typ:"session", signed with a derived key), even though all three are
 * derived from the same SESSION_SECRET.
 */
// 365 days — a portal is the client's ongoing window into the booking, which
// can span many months from enquiry through the event date and final saldo.
// Unlike the one-time accept link (14 days), this link is meant to stay useful
// for the whole relationship, so the TTL is deliberately long. The token is
// unforgeable and read-only, so the exposure of a forwarded link is limited to
// viewing already-shared booking details, never a state change.
const TTL_MS = 1000 * 60 * 60 * 24 * 365;

let randomFallbackSecret: string | null = null;

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (hash) {
      // Derive a STABLE (but non-public) key from the secret password hash, the
      // same way admin-auth / proposal-token do. A per-process random key would
      // differ between concurrently-warm serverless instances, so a portal link
      // signed by one instance would 404 when the client's click lands on
      // another. Still: set a real SESSION_SECRET.
      log.error(
        "portal-token: SESSION_SECRET não definido em produção — a derivar do ADMIN_PASSWORD_HASH; defina um SESSION_SECRET aleatório de 32+ caracteres",
      );
      return `derived:${hash}`;
    }
    // Neither secret configured: fall back to a per-process random key. Links may
    // stop validating across instances/restarts, but there's no stable secret to
    // sign with and we must never use a public/committed value.
    if (!randomFallbackSecret) randomFallbackSecret = randomBytes(32).toString("base64url");
    return randomFallbackSecret;
  }
  return "liquen-dev-portal-secret-change-me";
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Mint a tamper-proof portal link token for a quote. */
export function createPortalToken(quoteId: string): string {
  const payload = { typ: "portal", qid: quoteId, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Validate a token; returns the quote id or null if invalid/expired/tampered. */
export function readPortalToken(token: string | undefined | null): { quoteId: string } | null {
  if (!token) return null;
  // A minted token is exactly `body.sig` — base64url contains no ".", so any
  // token that doesn't split into precisely two non-empty parts is malformed or
  // tampered (e.g. trailing junk appended after a valid signature) and refused.
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // A token that declares a different kind (a proposal accept link, an admin
    // session) is never a portal link — refuse it, keeping the trust domains
    // separate.
    if (payload.typ !== "portal") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.qid !== "string" || !payload.qid) return null;
    return { quoteId: payload.qid };
  } catch {
    return null;
  }
}

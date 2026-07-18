import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { log } from "./logger";

/**
 * Signed, expiring tokens for the public "accept your proposal online" links.
 *
 * Same wire format as the admin session (src/lib/admin-auth.ts): an HMAC over a
 * base64url payload. The token is tamper-proof and unguessable, so a client can
 * only ever act on the exact proposal the link was minted for — no id
 * enumeration, no way to forge an acceptance.
 *
 * Domain separation: the payload carries `typ: "proposal"`, and the admin
 * session signs with a *derived* key while these tokens sign with the raw base
 * secret. Together this ensures a proposal link — which lives in a client's URL
 * for 14 days — can NEVER be replayed as an admin session cookie (and vice
 * versa), even though both are derived from the same SESSION_SECRET.
 */
// 14 days — comfortably past a normal decision window while keeping the
// exposure window of a forwarded link short. The state-changing action is
// already effectively one-time (the route is idempotent once the proposal is
// accepted/declined); per-proposal revocation would need a data-model change
// for little marginal gain over an unforgeable + rate-limited + short-lived token.
const TTL_MS = 1000 * 60 * 60 * 24 * 14;

let randomFallbackSecret: string | null = null;

function secret(): string {
  const s = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (hash) {
      // Derive a STABLE (but non-public) key from the secret password hash, the
      // same way admin-auth does. A per-process random key would differ between
      // concurrently-warm serverless instances, so a proposal link signed by one
      // instance would 401 when the client's click lands on another — breaking
      // real accept/decline links, not just surviving restarts. Still: set a real
      // SESSION_SECRET.
      log.error(
        "proposal-token: SESSION_SECRET não definido em produção — a derivar do ADMIN_PASSWORD_HASH; defina um SESSION_SECRET aleatório de 32+ caracteres",
      );
      return `derived:${hash}`;
    }
    // Neither secret configured: fall back to a per-process random key. Links may
    // stop validating across instances/restarts, but there's no stable secret to
    // sign with and we must never use a public/committed value.
    if (!randomFallbackSecret) randomFallbackSecret = randomBytes(32).toString("base64url");
    return randomFallbackSecret;
  }
  return "liquen-dev-proposal-secret-change-me";
}

function sign(body: string): string {
  return createHmac("sha256", secret()).update(body).digest("base64url");
}

/** Mint a tamper-proof link token for a proposal. */
export function createProposalToken(proposalId: string): string {
  const payload = { typ: "proposal", pid: proposalId, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Validate a token; returns the proposal id or null if invalid/expired/tampered. */
export function readProposalToken(token: string | undefined | null): { proposalId: string } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    // A token that declares a different kind (e.g. an admin session,
    // typ:"session") is never a proposal link — refuse it. Tokens minted before
    // this claim existed carry no `typ`; still accept those so already-sent
    // 14-day accept links keep working.
    if (payload.typ !== undefined && payload.typ !== "proposal") return null;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.pid !== "string" || !payload.pid) return null;
    return { proposalId: payload.pid };
  } catch {
    return null;
  }
}

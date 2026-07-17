import "server-only";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/**
 * Signed, expiring tokens for the public "accept your proposal online" links.
 *
 * Same proven design as the admin session (src/lib/admin-auth.ts): an HMAC over
 * a base64url payload `{ pid, exp }`. The token is tamper-proof and unguessable,
 * so a client can only ever act on the exact proposal the link was minted for —
 * there's no id enumeration and no way to forge an acceptance.
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
    // Never sign with a public/committed value in prod. A random per-process key
    // means links can't be forged (they simply stop validating after a restart,
    // which is the safe failure mode for a misconfigured deployment).
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
  const payload = { pid: proposalId, exp: Date.now() + TTL_MS };
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
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.pid !== "string" || !payload.pid) return null;
    return { proposalId: payload.pid };
  } catch {
    return null;
  }
}

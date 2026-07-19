import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createPortalToken, readPortalToken } from "./portal-token";
import { createProposalToken } from "./proposal-token";
import { createSession } from "./admin-auth";

// portal-token reads the signing secret lazily from the environment, so keep
// each test hermetic by controlling SESSION_SECRET.
const ENV_KEYS = ["SESSION_SECRET", "ADMIN_SESSION_SECRET"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SESSION_SECRET = "test-secret-please-change-1234567890";
});

afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

// Re-create the wire format with an arbitrary payload, for negative cases that
// the public API would never mint itself.
function forge(payload: unknown, secret = process.env.SESSION_SECRET!): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

describe("portal-token — signed client portal links", () => {
  it("round-trips a valid token", () => {
    const token = createPortalToken("LIQ-ABC-123");
    expect(readPortalToken(token)).toEqual({ quoteId: "LIQ-ABC-123" });
  });

  it("rejects a tampered payload kept alongside the original signature", () => {
    const token = createPortalToken("LIQ-ABC-123");
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ typ: "portal", qid: "LIQ-EVIL-999", exp: Date.now() + 1e9 }),
    ).toString("base64url");
    expect(readPortalToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects garbage, empty, null and undefined tokens", () => {
    expect(readPortalToken("")).toBeNull();
    expect(readPortalToken("not-a-token")).toBeNull();
    expect(readPortalToken("a.b.c")).toBeNull();
    expect(readPortalToken(null)).toBeNull();
    expect(readPortalToken(undefined)).toBeNull();
  });

  // A minted token is exactly `body.sig` (base64url has no "."), so a token
  // carrying extra "."-segments is malformed/tampered and must be refused —
  // never silently accepted by ignoring the trailing junk.
  it("rejects an otherwise-valid token with a trailing extra segment", () => {
    const token = createPortalToken("LIQ-ABC-123");
    expect(readPortalToken(`${token}.garbage`)).toBeNull();
    expect(readPortalToken(`${token}.`)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createPortalToken("LIQ-ABC-123");
    process.env.SESSION_SECRET = "a-totally-different-secret-987654321";
    expect(readPortalToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createPortalToken("LIQ-ABC-123");
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z")); // > 365 days later
    expect(readPortalToken(token)).toBeNull();
  });

  it("rejects a validly-signed token that carries no quote id", () => {
    expect(readPortalToken(forge({ typ: "portal", exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("rejects a token with a non-numeric expiry", () => {
    expect(readPortalToken(forge({ typ: "portal", qid: "LIQ-1", exp: "soon" }))).toBeNull();
  });

  it("rejects a token with an empty-string quote id", () => {
    expect(readPortalToken(forge({ typ: "portal", qid: "", exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("mints unguessable, per-quote tokens", () => {
    const a = createPortalToken("LIQ-A");
    const b = createPortalToken("LIQ-B");
    expect(a).not.toEqual(b);
    expect(readPortalToken(a)).toEqual({ quoteId: "LIQ-A" });
    expect(readPortalToken(b)).toEqual({ quoteId: "LIQ-B" });
  });

  // Domain separation: neither a proposal accept link nor an admin session must
  // read as a portal link (each declares a different typ).
  it("does not accept a proposal accept token as a portal link", () => {
    expect(readPortalToken(createProposalToken("prop-123"))).toBeNull();
  });

  it("does not accept an admin session token as a portal link", () => {
    const session = createSession("Catarina");
    expect(readPortalToken(session)).toBeNull();
  });

  it("rejects a validly-signed token that declares a non-portal type", () => {
    expect(
      readPortalToken(forge({ typ: "proposal", qid: "LIQ-1", exp: Date.now() + 1e9 })),
    ).toBeNull();
  });

  it("rejects a validly-signed token that carries no type claim", () => {
    // Portal links always declare typ:"portal"; a payload without it is never a
    // portal link (unlike legacy proposal links, portal is a new namespace).
    expect(readPortalToken(forge({ qid: "LIQ-1", exp: Date.now() + 1e9 }))).toBeNull();
  });
});

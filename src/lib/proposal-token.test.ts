import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { createProposalToken, readProposalToken } from "./proposal-token";
import { createSession } from "./admin-auth";

// proposal-token reads the signing secret lazily from the environment, so keep
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

describe("proposal-token — signed accept links", () => {
  it("round-trips a valid token", () => {
    const token = createProposalToken("prop-123");
    expect(readProposalToken(token)).toEqual({ proposalId: "prop-123" });
  });

  it("rejects a tampered payload kept alongside the original signature", () => {
    const token = createProposalToken("prop-123");
    const [, sig] = token.split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ pid: "prop-999", exp: Date.now() + 1e9 }),
    ).toString("base64url");
    expect(readProposalToken(`${forgedBody}.${sig}`)).toBeNull();
  });

  it("rejects garbage, empty, null and undefined tokens", () => {
    expect(readProposalToken("")).toBeNull();
    expect(readProposalToken("not-a-token")).toBeNull();
    expect(readProposalToken("a.b.c")).toBeNull();
    expect(readProposalToken(null)).toBeNull();
    expect(readProposalToken(undefined)).toBeNull();
  });

  it("rejects a token signed with a different secret", () => {
    const token = createProposalToken("prop-123");
    process.env.SESSION_SECRET = "a-totally-different-secret-987654321";
    expect(readProposalToken(token)).toBeNull();
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createProposalToken("prop-123");
    vi.setSystemTime(new Date("2026-04-01T00:00:00Z")); // > 45 days later
    expect(readProposalToken(token)).toBeNull();
  });

  it("rejects a validly-signed token that carries no proposal id", () => {
    expect(readProposalToken(forge({ exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("rejects a token with a non-numeric expiry", () => {
    expect(readProposalToken(forge({ pid: "prop-1", exp: "soon" }))).toBeNull();
  });

  it("rejects a token with an empty-string proposal id", () => {
    expect(readProposalToken(forge({ pid: "", exp: Date.now() + 1e9 }))).toBeNull();
  });

  it("mints unguessable, per-proposal tokens", () => {
    const a = createProposalToken("prop-A");
    const b = createProposalToken("prop-B");
    expect(a).not.toEqual(b);
    expect(readProposalToken(a)).toEqual({ proposalId: "prop-A" });
    expect(readProposalToken(b)).toEqual({ proposalId: "prop-B" });
  });

  // Domain separation: an admin session token must NOT read as a proposal token
  // (the session signs with a derived key AND declares typ:"session").
  it("does not accept an admin session token as a proposal link", () => {
    const session = createSession("Catarina");
    expect(readProposalToken(session)).toBeNull();
  });

  it("rejects a validly-signed token that declares a non-proposal type", () => {
    expect(
      readProposalToken(forge({ typ: "session", pid: "prop-1", exp: Date.now() + 1e9 })),
    ).toBeNull();
  });

  // Backward compatibility: accept links minted before the typ claim existed
  // (payload had only { pid, exp }) must keep validating for their 14-day life.
  it("still accepts a legacy token that carries no type claim", () => {
    expect(readProposalToken(forge({ pid: "prop-legacy", exp: Date.now() + 1e9 }))).toEqual({
      proposalId: "prop-legacy",
    });
  });
});

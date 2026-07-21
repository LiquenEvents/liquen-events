import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { NextRequest } from "next/server";
import { createSession, readSession, isAuthed, ADMIN_COOKIE } from "./admin-auth";
import { createPortalToken } from "./portal-token";

// Adversarial coverage for the admin session token verifier. The happy path and
// the tamper/expiry/version/proposal-confusion cases live in admin-auth.test.ts;
// this file adds the attacker-shaped inputs that verifier must survive without
// throwing and without ever honouring a non-canonical or forged token.

const SAVED = process.env.SESSION_SECRET;

beforeAll(() => {
  // Obvious low-entropy placeholder, not a real key.
  process.env.SESSION_SECRET = "test-admin-adversarial-secret-1234567890"; // gitleaks:allow
});

afterAll(() => {
  if (SAVED === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = SAVED;
});

/** Minimal NextRequest stand-in exposing only what isAuthed reads. */
function reqWithCookie(value: string | undefined): NextRequest {
  return {
    cookies: {
      get: (name: string) => (name === ADMIN_COOKIE && value !== undefined ? { value } : undefined),
    },
  } as unknown as NextRequest;
}

describe("readSession — non-canonical token shape (trailing junk)", () => {
  it("refuses a valid token with an extra dotted segment appended", () => {
    const token = createSession("Catarina");
    expect(readSession(token)).toEqual({ name: "Catarina" });
    // base64url contains no ".", so a genuine token is exactly `body.sig`.
    // Anything with a 3rd segment is tampered/non-canonical and must be refused,
    // matching the hardened portal-token verifier.
    expect(readSession(`${token}.junk`)).toBeNull();
    expect(readSession(`${token}.a.b.c`)).toBeNull();
  });

  it("isAuthed rejects a cookie carrying a token with trailing junk", () => {
    const token = createSession("Catarina");
    expect(isAuthed(reqWithCookie(token))).toBe(true);
    expect(isAuthed(reqWithCookie(`${token}.junk`))).toBe(false);
  });
});

describe("readSession — hostile inputs never throw, always deny", () => {
  it("denies null / undefined / empty / dotless / dot-only inputs", () => {
    expect(readSession(null)).toBeNull();
    expect(readSession(undefined)).toBeNull();
    expect(readSession("")).toBeNull();
    expect(readSession("no-separator-here")).toBeNull();
    expect(readSession(".")).toBeNull();
    expect(readSession("body.")).toBeNull();
    expect(readSession(".sig")).toBeNull();
  });

  it("denies an oversized cookie without throwing", () => {
    const huge = "A".repeat(200_000) + "." + "B".repeat(200_000);
    expect(() => readSession(huge)).not.toThrow();
    expect(readSession(huge)).toBeNull();
  });

  it("denies a well-formed shape whose body is not valid base64url JSON", () => {
    // Reaches the JSON.parse branch only if the sig matched, which it cannot for
    // an attacker; but the verifier must still never throw on garbage bodies.
    expect(() => readSession("!!!not-base64!!!.@@@bad-sig@@@")).not.toThrow();
    expect(readSession("!!!not-base64!!!.@@@bad-sig@@@")).toBeNull();
  });

  it("denies a short signature (length mismatch) without throwing", () => {
    const token = createSession("Catarina");
    const [body] = token.split(".");
    expect(() => readSession(`${body}.x`)).not.toThrow();
    expect(readSession(`${body}.x`)).toBeNull();
  });

  it("denies an unsigned but well-shaped forgery (right body, wrong sig)", () => {
    const forged = Buffer.from(
      JSON.stringify({ typ: "session", sub: "Hacker", exp: Date.now() + 1e9, v: "1" }),
    ).toString("base64url");
    expect(readSession(`${forged}.${"A".repeat(43)}`)).toBeNull();
  });
});

describe("readSession — cross-domain token confusion", () => {
  it("never accepts a portal-link token as an admin session", () => {
    // Same SESSION_SECRET, same wire format, but signed with the raw secret and
    // carrying typ:"portal" — must be cryptographically and semantically refused.
    const portal = createPortalToken("quote-123");
    expect(readSession(portal)).toBeNull();
  });
});

describe("isAuthed — cookie plumbing", () => {
  it("is false when the admin cookie is absent", () => {
    expect(isAuthed(reqWithCookie(undefined))).toBe(false);
  });

  it("is false for an empty cookie value", () => {
    expect(isAuthed(reqWithCookie(""))).toBe(false);
  });

  it("is true for a genuine session cookie", () => {
    expect(isAuthed(reqWithCookie(createSession("Rui")))).toBe(true);
  });
});

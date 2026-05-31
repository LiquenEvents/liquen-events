import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import { verifyCredentials, createSession, readSession } from "./admin-auth";

// Keep each test hermetic: auth reads env lazily, so reset what we touch.
const ENV_KEYS = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH", "SESSION_SECRET"] as const;
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

describe("verifyCredentials — shared password fallback", () => {
  it("accepts the default dev password with any name", () => {
    expect(verifyCredentials("Catarina", "liquen2026")).toEqual({ name: "Catarina" });
  });

  it("rejects a wrong password", () => {
    expect(verifyCredentials("Catarina", "wrong")).toBeNull();
  });

  it("rejects an empty password", () => {
    expect(verifyCredentials("Catarina", "")).toBeNull();
  });

  it("defaults the display name when none is given", () => {
    expect(verifyCredentials("", "liquen2026")).toEqual({ name: "Equipa" });
  });

  it("honours a custom ADMIN_PASSWORD_HASH", () => {
    process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync("s3cret!", 10);
    expect(verifyCredentials("Rui", "s3cret!")).toEqual({ name: "Rui" });
    expect(verifyCredentials("Rui", "liquen2026")).toBeNull();
  });
});

describe("verifyCredentials — individual accounts (ADMIN_USERS)", () => {
  beforeEach(() => {
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("cat-pass", 10) },
      { name: "Rui", passwordHash: bcrypt.hashSync("rui-pass", 10) },
    ]);
  });

  it("matches each user against their own password", () => {
    expect(verifyCredentials("Catarina", "cat-pass")).toEqual({ name: "Catarina" });
    expect(verifyCredentials("Rui", "rui-pass")).toEqual({ name: "Rui" });
  });

  it("does not accept another user's password", () => {
    expect(verifyCredentials("Catarina", "rui-pass")).toBeNull();
  });

  it("matches the name case-insensitively", () => {
    expect(verifyCredentials("catarina", "cat-pass")).toEqual({ name: "Catarina" });
  });

  it("rejects unknown users", () => {
    expect(verifyCredentials("Intruder", "cat-pass")).toBeNull();
  });

  it("falls back to shared password when ADMIN_USERS is malformed", () => {
    process.env.ADMIN_USERS = "{not json";
    expect(verifyCredentials("Anyone", "liquen2026")).toEqual({ name: "Anyone" });
  });
});

describe("sessions — signed and expiring", () => {
  it("round-trips a valid session", () => {
    const token = createSession("Catarina");
    expect(readSession(token)).toEqual({ name: "Catarina" });
  });

  it("rejects a tampered payload", () => {
    const token = createSession("Catarina");
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "Hacker", exp: Date.now() + 1e9 })).toString("base64url");
    expect(readSession(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects garbage and empty tokens", () => {
    expect(readSession("")).toBeNull();
    expect(readSession("not-a-token")).toBeNull();
    expect(readSession(null)).toBeNull();
  });

  it("rejects a session signed with a different secret", () => {
    const token = createSession("Catarina");
    process.env.SESSION_SECRET = "a-totally-different-secret-987654321";
    expect(readSession(token)).toBeNull();
  });

  it("rejects an expired session", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const token = createSession("Catarina");
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z")); // > 30 days later
    expect(readSession(token)).toBeNull();
  });
});

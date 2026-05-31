import { describe, it, expect, vi, afterEach } from "vitest";
import { totp, verifyTotp, generateTotpSecret } from "./totp";

// RFC 6238 secret "12345678901234567890" (ASCII) in base32 — a PUBLIC test
// vector from the standard, not a real secret. gitleaks:allow
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // gitleaks:allow

afterEach(() => vi.useRealTimers());

describe("totp — RFC 6238 vectors (SHA-1, 6 digits)", () => {
  it.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1234567890, "005924"],
    [2000000000, "279037"],
  ])("matches the published code at t=%i", (t, expected) => {
    expect(totp(RFC_SECRET, t)).toBe(expected);
  });
});

describe("verifyTotp", () => {
  it("accepts the current code and rejects a wrong one", () => {
    const secret = generateTotpSecret();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const code = totp(secret, Date.now() / 1000);
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, "000000")).toBe(false);
  });

  it("rejects malformed tokens", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("generates distinct 32-char base32 secrets", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });
});

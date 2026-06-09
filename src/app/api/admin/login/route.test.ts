import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

// Only the rate limiter is mocked — the real auth (verifyCredentials, sessions)
// is exercised end to end against the dev shared password.
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST } from "./route";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const saved: Record<string, string | undefined> = {};
const KEYS = ["ADMIN_USERS", "ADMIN_PASSWORD_HASH", "ADMIN_TOTP_SECRET", "SESSION_SECRET"];

beforeEach(() => {
  rl.result = { ok: true };
  vi.clearAllMocks();
  for (const k of KEYS) saved[k] = process.env[k];
  // Dev shared-password mode: no individual users, no extra password/2FA.
  delete process.env.ADMIN_USERS;
  delete process.env.ADMIN_PASSWORD_HASH;
  delete process.env.ADMIN_TOTP_SECRET;
  process.env.SESSION_SECRET = "login-test-secret-1234567890";
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("POST /api/admin/login", () => {
  it("rejects wrong credentials with 401 and sets no session", async () => {
    const res = await POST(postReq({ name: "Catarina", password: "wrong" }));
    expect(res.status).toBe(401);
    expect(res.cookies.get(ADMIN_COOKIE)).toBeUndefined();
  });

  it("accepts the dev password and mints a session cookie", async () => {
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const cookie = res.cookies.get(ADMIN_COOKIE);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
  });

  it("throttles brute-force attempts with 429", async () => {
    rl.result = { ok: false, retryAfter: 30 };
    const res = await POST(postReq({ name: "Catarina", password: "liquen2026" }));
    expect(res.status).toBe(429);
  });
});

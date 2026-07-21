import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: false }));
const sb = vi.hoisted(() => ({
  client: null as unknown,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => sb.client }));

import { GET } from "./route";

function get(): NextRequest {
  return new Request("https://liquen.test/api/health") as unknown as NextRequest;
}

// Build a minimal Supabase-like stub whose HEAD count query resolves to the
// given result (or throws when `throws` is set).
function fakeSupabase(result: { error: unknown } | "throw") {
  return {
    from: () => ({
      select: () => ({
        abortSignal: () =>
          result === "throw" ? Promise.reject(new Error("boom")) : Promise.resolve(result),
      }),
    }),
  };
}

beforeEach(() => {
  authState.authed = false;
  sb.client = null;
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("no Supabase configured → 200, status ok, database:fallback (public, no auth)", async () => {
    sb.client = null;
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.checks.database).toBe("fallback");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("database responding → 200, ok, database:ok", async () => {
    sb.client = fakeSupabase({ error: null });
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.checks.database).toBe("ok");
  });

  it("database query returns an error → 503 degraded, database:down", async () => {
    sb.client = fakeSupabase({ error: { message: "relation missing" } });
    const res = await GET(get());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("degraded");
    expect(json.checks.database).toBe("down");
  });

  it("database query throwing → 503 degraded, database:down (never throws out of the route)", async () => {
    sb.client = fakeSupabase("throw");
    const res = await GET(get());
    expect(res.status).toBe(503);
    expect((await res.json()).checks.database).toBe("down");
  });

  it("does not leak the build SHA to an unauthenticated caller", async () => {
    authState.authed = false;
    const res = await GET(get());
    expect(await res.json()).not.toHaveProperty("version");
  });

  it("reveals the build SHA only to an authenticated admin", async () => {
    authState.authed = true;
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567";
    const res = await GET(get());
    const json = await res.json();
    expect(json.version).toBe("abcdef1");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("reports integration booleans only, never secret values", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.VAPID_PUBLIC_KEY = "pub";
    const res = await GET(get());
    const json = await res.json();
    expect(json.checks.email).toBe(true);
    expect(json.checks.push).toBe(true);
    // booleans, not the underlying values
    expect(json.checks.email).not.toBe("smtp.example.com");
    delete process.env.SMTP_HOST;
    delete process.env.VAPID_PUBLIC_KEY;
  });

  it("includes a fresh ISO timestamp and a numeric uptime", async () => {
    const res = await GET(get());
    const json = await res.json();
    expect(Number.isNaN(Date.parse(json.time))).toBe(false);
    expect(typeof json.uptime).toBe("number");
  });
});

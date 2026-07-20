import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));
const push = vi.hoisted(() => ({
  save: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  configured: true,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/push", () => ({
  saveSubscription: push.save,
  removeSubscription: push.remove,
  pushConfigured: () => push.configured,
}));
// validation (pushSubscriptionSchema) is exercised for real — the route's 400
// contract depends on its actual behaviour.

import { GET, POST, DELETE } from "./route";

const VALID_SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BQ".repeat(20), auth: "AZ".repeat(10) },
};

function req(method: string, body?: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authState.authed = true;
  push.configured = true;
  push.save.mockReset().mockResolvedValue(undefined);
  push.remove.mockReset().mockResolvedValue(undefined);
  vi.clearAllMocks();
});

describe("GET /api/push/subscribe", () => {
  it("401 without auth", async () => {
    authState.authed = false;
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("reports configured + public key for an authed client", async () => {
    process.env.VAPID_PUBLIC_KEY = "pub-key-xyz";
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.configured).toBe(true);
    expect(json.publicKey).toBe("pub-key-xyz");
    delete process.env.VAPID_PUBLIC_KEY;
  });
});

describe("POST /api/push/subscribe", () => {
  it("401 without auth (never persists)", async () => {
    authState.authed = false;
    const res = await POST(req("POST", VALID_SUB));
    expect(res.status).toBe(401);
    expect(push.save).not.toHaveBeenCalled();
  });

  it("stores a valid subscription and returns { ok: true }", async () => {
    const res = await POST(req("POST", VALID_SUB));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(push.save).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: VALID_SUB.endpoint }),
    );
  });

  it("duplicate subscribe is idempotent (200 both times)", async () => {
    expect((await POST(req("POST", VALID_SUB))).status).toBe(200);
    expect((await POST(req("POST", VALID_SUB))).status).toBe(200);
    expect(push.save).toHaveBeenCalledTimes(2);
  });

  it("malformed JSON body → 400, not 500 (and never persists)", async () => {
    const res = await POST(req("POST", "{ not json", true));
    expect(res.status).toBe(400);
    expect(push.save).not.toHaveBeenCalled();
  });

  it("missing keys → 400 (schema rejects)", async () => {
    const res = await POST(req("POST", { endpoint: VALID_SUB.endpoint }));
    expect(res.status).toBe(400);
    expect(push.save).not.toHaveBeenCalled();
  });

  it("non-https endpoint → 400 (schema rejects the endpoint)", async () => {
    const res = await POST(
      req("POST", { endpoint: "http://evil.example/x", keys: VALID_SUB.keys }),
    );
    expect(res.status).toBe(400);
    expect(push.save).not.toHaveBeenCalled();
  });

  it("null body → 400 (schema rejects)", async () => {
    const res = await POST(req("POST", null));
    expect(res.status).toBe(400);
    expect(push.save).not.toHaveBeenCalled();
  });

  it("a storage failure surfaces as 500 (not a thrown/unhandled error)", async () => {
    push.save.mockRejectedValue(new Error("supabase down"));
    const res = await POST(req("POST", VALID_SUB));
    expect(res.status).toBe(500);
  });
});

describe("DELETE /api/push/subscribe", () => {
  it("401 without auth", async () => {
    authState.authed = false;
    expect((await DELETE(req("DELETE", { endpoint: VALID_SUB.endpoint }))).status).toBe(401);
  });

  it("removes the given endpoint", async () => {
    const res = await DELETE(req("DELETE", { endpoint: VALID_SUB.endpoint }));
    expect(res.status).toBe(200);
    expect(push.remove).toHaveBeenCalledWith(VALID_SUB.endpoint);
  });

  it("malformed/empty DELETE body must not 500 (idempotent unsubscribe)", async () => {
    const res = await DELETE(req("DELETE", "{ not json", true));
    expect(res.status).toBe(200);
    expect(push.remove).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));
const inbox = vi.hoisted(() => ({ configured: true }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/inbox", () => ({
  imapConfigured: () => inbox.configured,
  setFlags: vi.fn(async (_uid: number, flags: Record<string, boolean>) => flags),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";
import { setFlags } from "@/lib/inbox";

function postReq(
  uid: string,
  body: unknown,
  raw = false,
): { req: NextRequest; params: Promise<{ uid: string }> } {
  const req = new Request(`https://liquen.test/api/inbox/${uid}/flags`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ uid }) };
}

beforeEach(() => {
  authState.authed = true;
  inbox.configured = true;
  vi.clearAllMocks();
});

describe("POST /api/inbox/[uid]/flags", () => {
  it("marks a message read (\\Seen)", async () => {
    const { req, params } = postReq("42", { seen: true });
    const res = await POST(req, { params });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, seen: true });
    expect(setFlags).toHaveBeenCalledWith(42, { seen: true });
  });

  it("passes flagged through", async () => {
    const { req, params } = postReq("42", { flagged: true });
    const res = await POST(req, { params });
    expect(await res.json()).toEqual({ ok: true, flagged: true });
  });

  it("401 without auth (and never calls setFlags)", async () => {
    authState.authed = false;
    const { req, params } = postReq("42", { seen: true });
    expect((await POST(req, { params })).status).toBe(401);
    expect(setFlags).not.toHaveBeenCalled();
  });

  it("503 when e-mail is not configured", async () => {
    inbox.configured = false;
    const { req, params } = postReq("42", { seen: true });
    expect((await POST(req, { params })).status).toBe(503);
  });

  it("400 on an invalid UID", async () => {
    const { req, params } = postReq("abc", { seen: true });
    expect((await POST(req, { params })).status).toBe(400);
    expect(setFlags).not.toHaveBeenCalled();
  });

  it("400 on an empty body (neither seen nor flagged)", async () => {
    const { req, params } = postReq("42", {});
    expect((await POST(req, { params })).status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    const { req, params } = postReq("42", "{ not json", true);
    expect((await POST(req, { params })).status).toBe(400);
  });
});

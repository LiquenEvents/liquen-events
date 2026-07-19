import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(
    async (
      id: string,
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown> | null> => ({ id, ...patch }),
  ),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({ updateProposal: store.update }));

import { PATCH } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/propostas/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}
function rawReq(raw: string): NextRequest {
  return new Request("https://liquen.test/api/propostas/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: raw,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("PATCH /api/propostas/[id]", () => {
  it("rejects the unauthenticated with 401 and never updates", async () => {
    const res = await PATCH(req({ status: "aceite" }), ctx("p1"));
    expect(res.status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("updates an allow-listed status for an authenticated admin", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "aceite", respondedAt: "2026-07-19" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("p1", {
      status: "aceite",
      respondedAt: "2026-07-19",
    });
  });

  it("blocks mass-assignment: only status + respondedAt pass through", async () => {
    authed.ok = true;
    await PATCH(
      req({ status: "aceite", total: 999999, id: "evil", clientEmail: "hacker@x.com" }),
      ctx("p1"),
    );
    expect(store.update).toHaveBeenCalledWith("p1", { status: "aceite" });
  });

  it("rejects an invalid status value with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "concluida" }), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the proposal does not exist", async () => {
    authed.ok = true;
    store.update.mockResolvedValueOnce(null);
    const res = await PATCH(req({ status: "aceite" }), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("returns 400 (not 500) for a malformed JSON body", async () => {
    authed.ok = true;
    const res = await PATCH(rawReq("not-json{"), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-object body (null) instead of crashing on `in`", async () => {
    authed.ok = true;
    const res = await PATCH(rawReq("null"), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

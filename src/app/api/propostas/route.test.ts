import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "p1", status: "enviada" }]),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: store.list }));

import { GET } from "./route";

function req(): NextRequest {
  return new Request("https://liquen.test/api/propostas", {
    method: "GET",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/propostas", () => {
  it("rejects the unauthenticated with 401 and never lists", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("returns the proposals list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p1", status: "enviada" }]);
  });

  it("returns 500 (not a crash) when the store throws", async () => {
    authed.ok = true;
    store.list.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

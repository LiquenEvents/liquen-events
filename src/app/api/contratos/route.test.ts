import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "c1", status: "aceite" }]),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/contracts-store", () => ({ listContracts: store.list }));

import { GET } from "./route";

function req(): NextRequest {
  return new Request("https://liquen.test/api/contratos", {
    method: "GET",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/contratos", () => {
  it("rejects the unauthenticated with 401 and never lists", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("returns the contracts list (read-only audit view) for an admin", async () => {
    authed.ok = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "c1", status: "aceite" }]);
  });

  it("returns 500 when the store throws", async () => {
    authed.ok = true;
    store.list.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

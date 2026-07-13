import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  del: vi.fn(async (id: string) => id),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/suppliers-store", () => ({
  updateSupplier: store.update,
  deleteSupplier: store.del,
}));

import { PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/fornecedores/s1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/fornecedores/[id]", () => {
  it("PATCH and DELETE reject the unauthenticated with 401", async () => {
    expect((await PATCH(req("PATCH", { name: "X" }), ctx("s1"))).status).toBe(401);
    expect((await DELETE(req("DELETE"), ctx("s1"))).status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
    expect(store.del).not.toHaveBeenCalled();
  });

  it("PATCH updates the supplier when authenticated", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { name: "Novo nome" }), ctx("s1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("s1", { name: "Novo nome" });
  });

  it("DELETE removes the supplier when authenticated", async () => {
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("s1"));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalledWith("s1");
  });

  it("blocks mass-assignment of id/createdAt via PATCH", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", { name: "Novo nome", id: "s2-evil", createdAt: "2000-01-01" }),
      ctx("s1"),
    );
    expect(store.update).toHaveBeenCalledWith("s1", { name: "Novo nome" });
  });

  it("rejects invalid field values with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { email: "not-an-email" }), ctx("s1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

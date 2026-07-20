import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(async (id: string, patch: Record<string, unknown>) =>
    id === "missing" ? null : { id, updatedAt: "2026-07-20", name: "Item", ...patch },
  ),
  remove: vi.fn(async (_id: string) => {}),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/inventory-store", () => ({
  updateItem: store.update,
  deleteItem: store.remove,
  PROP_CATEGORIES: ["Vasos e Jarras", "Mobiliário", "Outro"],
}));

import { PATCH, DELETE } from "./route";

function req(method: "PATCH" | "DELETE", body?: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inventario/it1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}
function patch(id: string, body?: unknown, raw = false) {
  return PATCH(req("PATCH", body, raw), { params: Promise.resolve({ id }) });
}
function del(id: string) {
  return DELETE(req("DELETE"), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("PATCH /api/inventario/[id]", () => {
  it("rejects the unauthenticated with 401 and never writes", async () => {
    expect((await patch("it1", { name: "X" })).status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("updates an existing item", async () => {
    authed.ok = true;
    const res = await patch("it1", { name: "Vaso novo", quantity: 3 });
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith(
      "it1",
      expect.objectContaining({ name: "Vaso novo", quantity: 3 }),
    );
  });

  it("404s (not 500) for an unknown id", async () => {
    authed.ok = true;
    const res = await patch("missing", { name: "X" });
    expect(res.status).toBe(404);
  });

  it("rejects clearing the name to empty with 400", async () => {
    authed.ok = true;
    const res = await patch("it1", { name: "   " });
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("clamps a negative quantity to 0", async () => {
    authed.ok = true;
    await patch("it1", { quantity: -10 });
    expect(store.update).toHaveBeenCalledWith("it1", expect.objectContaining({ quantity: 0 }));
  });

  it("caps a huge quantity at 1_000_000", async () => {
    authed.ok = true;
    await patch("it1", { quantity: 5_000_000 });
    expect(store.update).toHaveBeenCalledWith(
      "it1",
      expect.objectContaining({ quantity: 1_000_000 }),
    );
  });

  it("skips an invalid condition rather than persisting garbage", async () => {
    authed.ok = true;
    await patch("it1", { condition: "explodido", name: "Ok" });
    const [, appliedPatch] = store.update.mock.calls[0];
    expect(appliedPatch).not.toHaveProperty("condition");
    expect(appliedPatch).toHaveProperty("name", "Ok");
  });

  it("never lets a client overwrite server-assigned id/updatedAt", async () => {
    authed.ok = true;
    await patch("it1", { id: "hacked", updatedAt: "1999-01-01", name: "Legit" });
    const [, appliedPatch] = store.update.mock.calls[0];
    expect(appliedPatch).not.toHaveProperty("id");
    expect(appliedPatch).not.toHaveProperty("updatedAt");
    expect(appliedPatch).toEqual({ name: "Legit" });
  });

  it("rejects a JSON null body with 400, not 500 (regression: `key in null` crash)", async () => {
    authed.ok = true;
    const res = await patch("it1", null);
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("rejects a non-object (number) body with 400, not 500", async () => {
    authed.ok = true;
    const res = await patch("it1", 5);
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400, not 500", async () => {
    authed.ok = true;
    const res = await patch("it1", "{ not json", true);
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/inventario/[id]", () => {
  it("rejects the unauthenticated with 401 and never deletes", async () => {
    expect((await del("it1")).status).toBe(401);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("deletes an item and returns { ok: true }", async () => {
    authed.ok = true;
    const res = await del("it1");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith("it1");
  });

  it("is idempotent: deleting an unknown id still returns 200 ok", async () => {
    authed.ok = true;
    const res = await del("missing");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns a handled 500 (not a raw throw) when the store fails", async () => {
    authed.ok = true;
    store.remove.mockRejectedValueOnce(new Error("db down"));
    expect((await del("it1")).status).toBe(500);
  });
});

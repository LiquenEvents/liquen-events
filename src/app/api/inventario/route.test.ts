import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [] as unknown[]),
  create: vi.fn(async (i: Record<string, unknown>) => ({
    id: "it-new",
    updatedAt: "2026-07-20",
    ...i,
  })),
  throwOnList: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/inventory-store", () => ({
  listItems: vi.fn(async () => {
    if (store.throwOnList) throw new Error("db down");
    return store.list();
  }),
  createItem: store.create,
  PROP_CATEGORIES: ["Vasos e Jarras", "Mobiliário", "Outro"],
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inventario", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  store.throwOnList = false;
  store.list.mockResolvedValue([]);
  vi.clearAllMocks();
});

describe("GET /api/inventario", () => {
  it("rejects the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("returns 200 with an empty array on an empty catalog", async () => {
    authed.ok = true;
    store.list.mockResolvedValueOnce([]);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns 500 (handled, not a raw throw) when the store fails", async () => {
    authed.ok = true;
    store.throwOnList = true;
    expect((await GET(req("GET"))).status).toBe(500);
  });
});

describe("POST /api/inventario", () => {
  it("rejects the unauthenticated with 401 and never writes", async () => {
    expect((await POST(req("POST", { name: "Vaso" }))).status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("creates an item when authenticated", async () => {
    authed.ok = true;
    const res = await POST(
      req("POST", { name: "Vaso alto", category: "Vasos e Jarras", quantity: 5 }),
    );
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("rejects an empty name with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { name: "" }))).status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only name with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { name: "   " }))).status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("rejects a missing body with 400 (no name)", async () => {
    authed.ok = true;
    expect((await POST(req("POST", {}))).status).toBe(400);
  });

  it("clamps a negative quantity to 0", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "Vela", quantity: -50 }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0 }));
  });

  it("caps an absurdly large quantity at 1_000_000", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "Confetti", quantity: 9_999_999_999 }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 1_000_000 }));
  });

  it("coerces a non-numeric quantity to 0", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "X", quantity: "abc" }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ quantity: 0 }));
  });

  it("falls back to 'bom' for an invalid condition", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "X", condition: "explodido" }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ condition: "bom" }));
  });

  it("falls back to 'Outro' for an unknown category", async () => {
    authed.ok = true;
    await POST(req("POST", { name: "X", category: "Categoria Inexistente" }));
    expect(store.create).toHaveBeenCalledWith(expect.objectContaining({ category: "Outro" }));
  });

  it("rejects malformed JSON with 400, not 500", async () => {
    authed.ok = true;
    const res = await POST(req("POST", "{ not json", true));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("rejects a JSON null body with 400, not 500", async () => {
    authed.ok = true;
    const res = await POST(req("POST", null));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });
});

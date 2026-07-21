import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [
    {
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "S",
      body: "B",
      updatedAt: "2026-01-01",
    },
  ]),
  upsert: vi.fn(async (t: Record<string, unknown>) => ({ ...t, updatedAt: "2026-07-20" })),
  throwOnList: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/email-templates-store", () => ({
  listTemplatesWithDefaults: vi.fn(async () => {
    if (store.throwOnList) throw new Error("db down");
    return store.list();
  }),
  upsertTemplate: store.upsert,
}));

import { GET, POST, PUT } from "./route";

function req(method: "GET" | "POST" | "PUT", body?: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/email-templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const valid = {
  key: "sinal-recebido",
  name: "Sinal recebido",
  subject: "Recebido",
  body: "<p>Olá</p>",
};

beforeEach(() => {
  authed.ok = false;
  store.throwOnList = false;
  vi.clearAllMocks();
});

describe("GET /api/email-templates", () => {
  it("rejects the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("returns the templates for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("returns a handled 500 (not a raw throw) when the store fails", async () => {
    authed.ok = true;
    store.throwOnList = true;
    expect((await GET(req("GET"))).status).toBe(500);
  });
});

describe("POST /api/email-templates (upsert)", () => {
  it("rejects the unauthenticated with 401 and never writes", async () => {
    expect((await POST(req("POST", valid))).status).toBe(401);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("upserts a valid template", async () => {
    authed.ok = true;
    const res = await POST(req("POST", valid));
    expect(res.status).toBe(200);
    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "sinal-recebido", name: "Sinal recebido" }),
    );
  });

  it("allows an arbitrary (non-default) key — it becomes a new custom template", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { ...valid, key: "chave-personalizada" }));
    expect(res.status).toBe(200);
    expect(store.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "chave-personalizada" }),
    );
  });

  it("defaults a missing body to an empty string", async () => {
    authed.ok = true;
    await POST(req("POST", { key: "k", name: "N", subject: "S" }));
    expect(store.upsert).toHaveBeenCalledWith(expect.objectContaining({ body: "" }));
  });

  it("rejects a missing key with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { name: "N", subject: "S" }))).status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a whitespace-only key with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { key: "  ", name: "N", subject: "S" }))).status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing name with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { key: "k", subject: "S" }))).status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a missing subject with 400", async () => {
    authed.ok = true;
    expect((await POST(req("POST", { key: "k", name: "N" }))).status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with 400, not 500", async () => {
    authed.ok = true;
    const res = await POST(req("POST", "{ not json", true));
    expect(res.status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });

  it("rejects a JSON null body with 400, not 500", async () => {
    authed.ok = true;
    expect((await POST(req("POST", null))).status).toBe(400);
    expect(store.upsert).not.toHaveBeenCalled();
  });
});

describe("PUT /api/email-templates", () => {
  it("behaves identically to POST (create-or-update)", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", valid));
    expect(res.status).toBe(200);
    expect(store.upsert).toHaveBeenCalledTimes(1);
  });

  it("rejects the unauthenticated with 401", async () => {
    expect((await PUT(req("PUT", valid))).status).toBe(401);
  });
});

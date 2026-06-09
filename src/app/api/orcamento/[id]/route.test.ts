import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          name: "Ana Silva",
          email: "ana@example.com",
          phone: "910000000",
          company: "ACME",
          nif: "500000000",
          notes: "segredo",
          status: "pendente",
          guests: 50,
          date: "2026-09-01",
        }
      : null,
  ),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
vi.mock("@/lib/quotes-store", () => ({ getQuote: store.get, updateQuote: store.update }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));

import { GET, PATCH } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "PATCH", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id] — PII protection", () => {
  it("redacts personal data for the public (anti-enumeration)", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // No personal data leaks…
    expect(json.email).toBeUndefined();
    expect(json.name).toBeUndefined();
    expect(json.phone).toBeUndefined();
    expect(json.nif).toBeUndefined();
    expect(json.notes).toBeUndefined();
    // …but non-personal status fields are fine.
    expect(json.status).toBe("pendente");
    expect(json.guests).toBe(50);
  });

  it("returns the full record to an authenticated admin", async () => {
    authed.ok = true;
    const json = await (await GET(req("GET"), ctx("LIQ-1"))).json();
    expect(json.email).toBe("ana@example.com");
  });

  it("returns 404 for an unknown id", async () => {
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(404);
  });
});

describe("PATCH /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await PATCH(req("PATCH", { status: "cotado" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("only persists allow-listed fields (blocks mass-assignment)", async () => {
    authed.ok = true;
    await PATCH(
      req("PATCH", { status: "cotado", quotedPrice: 5000, email: "hacker@x.com", id: "evil" }),
      ctx("LIQ-1"),
    );
    expect(store.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado", quotedPrice: 5000 });
  });
});

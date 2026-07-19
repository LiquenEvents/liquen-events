import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          submittedAt: "2026-06-01T10:00:00.000Z",
          name: "Ana Silva",
          email: "ana@example.com",
          phone: "910000000",
          company: "ACME",
          nif: "500000000",
          notes: "segredo",
          status: "pendente",
          guests: 50,
          date: "2026-09-01",
          addons: [
            {
              id: "dj",
              name: "DJ",
              tier: "completo",
              price: 900,
              quantity: 1,
              pricingType: "fixed",
            },
          ],
          // Internal CRM data — must never appear in the public response.
          adminNotes: "nota interna",
          quotedPrice: 12500,
          activityLog: [{ id: "a1", at: "2026-06-02", kind: "manual_note", summary: "interno" }],
          messages: [{ at: "2026-06-02", body: "privado" }],
          payments: [{ id: "p1", kind: "sinal", amount: 3000, date: "2026-06-05", paid: true }],
          guestList: [{ id: "g1", name: "Convidado Secreto", party: 2, rsvp: "confirmado" }],
          lostReason: "—",
          assignedTo: "Catarina",
          contractRef: "2026-042",
          tags: ["VIP"],
        }
      : null,
  ),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  remove: vi.fn(async (_id: string) => {}),
}));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: store.get,
  updateQuote: store.update,
  deleteQuote: store.remove,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { GET, PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  rl.result = { ok: true };
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id] — PII protection", () => {
  it("redacts personal data for the public (anti-enumeration)", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    // The public view is an explicit allowlist of event facts — exactly these
    // keys, so a new Quote field can never leak by accident. (JSON drops the
    // allowlisted-but-undefined ones, e.g. packageTier/eventName here.)
    expect(Object.keys(json).sort()).toEqual(
      ["id", "submittedAt", "status", "guests", "date", "addons"].sort(),
    );
    expect(json.status).toBe("pendente");
    expect(json.guests).toBe(50);
    // Addons are trimmed to id/name/tier — no pricing internals.
    expect(json.addons).toEqual([{ id: "dj", name: "DJ", tier: "completo" }]);
  });

  it("returns the full record to an authenticated admin", async () => {
    authed.ok = true;
    const json = await (await GET(req("GET"), ctx("LIQ-1"))).json();
    expect(json.email).toBe("ana@example.com");
  });

  it("returns 404 for an unknown id", async () => {
    expect((await GET(req("GET"), ctx("nope"))).status).toBe(404);
  });

  it("rate-limits unauthenticated lookups (anti-enumeration)", async () => {
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(429);
    expect(store.get).not.toHaveBeenCalled();
  });

  it("never rate-limits an authenticated admin", async () => {
    authed.ok = true;
    rl.result = { ok: false, retryAfter: 42 };
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
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

describe("DELETE /api/orcamento/[id]", () => {
  it("requires authentication", async () => {
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("hard-deletes the quote for an authenticated admin", async () => {
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(store.remove).toHaveBeenCalledWith("LIQ-1");
  });
});

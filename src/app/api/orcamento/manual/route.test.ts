import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({ create: vi.fn(async () => {}) }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  generateQuoteId: () => "LIQ-MANUAL-0000000000000000",
}));

import { POST } from "./route";

function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/manual", () => {
  it("rejects the unauthenticated with 401 and never persists", async () => {
    const res = await POST(req({ name: "Ana" }));
    expect(res.status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("requires a non-empty name (400)", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "   " }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("creates a manual quote with a default em_revisao status and no client email sent", async () => {
    authed.ok = true;
    const res = await POST(req({ name: "Ana Cliente", email: "ana@x.pt", guests: 40 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.quote).toMatchObject({
      name: "Ana Cliente",
      status: "em_revisao",
      guests: 40,
      referralSource: "Contacto direto",
    });
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("clamps negative/absurd guest counts into range", async () => {
    authed.ok = true;
    const neg = await (await POST(req({ name: "X", guests: -5 }))).json();
    expect(neg.quote.guests).toBe(0);
    const huge = await (await POST(req({ name: "X", guests: 10_000_000 }))).json();
    expect(huge.quote.guests).toBe(100000);
  });

  it("honours an explicit status when provided", async () => {
    authed.ok = true;
    const json = await (await POST(req({ name: "X", status: "cotado" }))).json();
    expect(json.quote.status).toBe("cotado");
  });

  it("returns 500 when persistence throws", async () => {
    authed.ok = true;
    store.create.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req({ name: "Ana" }));
    expect(res.status).toBe(500);
  });
});

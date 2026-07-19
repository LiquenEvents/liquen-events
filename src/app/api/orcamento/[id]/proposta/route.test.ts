import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const quotes = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          name: "Ana",
          email: "ana@x.pt",
          date: "2026-09-01",
          guests: 50,
          location: "Lisboa",
        }
      : null,
  ),
  update: vi.fn(async () => ({})),
}));
const proposals = vi.hoisted(() => ({
  create: vi.fn(async (_p?: unknown) => {}),
  listForQuote: vi.fn(async () => [{ id: "p-existing", quoteId: "LIQ-1" }]),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: quotes.get, updateQuote: quotes.update }));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: proposals.create,
  listProposalsForQuote: proposals.listForQuote,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: () => "signed-token" }));
vi.mock("@/lib/proposal-pdf", () => ({
  renderProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { GET, POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/proposta", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validItems = { lineItems: [{ description: "Decoração", qty: 1, unitPrice: 1000 }] };

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.listForQuote).not.toHaveBeenCalled();
  });

  it("lists proposals for the quote for an admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p-existing", quoteId: "LIQ-1" }]);
  });
});

describe("POST /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401 and creates nothing", async () => {
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the quote does not exist", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("nope"));
    expect(res.status).toBe(404);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal with no valid line items (400)", async () => {
    authed.ok = true;
    // Zero-qty lines are filtered out → empty → 400.
    const res = await POST(
      req("POST", { lineItems: [{ description: "X", qty: 0, unitPrice: 100 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(400);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("creates + persists the proposal, emails the client, and advances the quote to cotado", async () => {
    authed.ok = true;
    const res = await POST(
      req("POST", { lineItems: [{ description: "Decoração", qty: 2, unitPrice: 1000 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // subtotal 2000, vat 0.23 → total 2460.
    expect(json.total).toBeCloseTo(2460, 5);
    expect(json.emailed).toBe(true);
    // Persisted as "enviada" before the email goes out.
    expect(proposals.create).toHaveBeenCalledTimes(1);
    expect(proposals.create.mock.calls[0][0]).toMatchObject({
      quoteId: "LIQ-1",
      status: "enviada",
      clientEmail: "ana@x.pt",
    });
    expect(mail.send).toHaveBeenCalledTimes(1);
    // Quote status advances (best-effort) to cotado with the quoted total.
    expect(quotes.update).toHaveBeenCalledWith("LIQ-1", { status: "cotado", quotedPrice: 2460 });
  });

  it("returns 503 (does not send an un-acceptable proposal) when persistence fails", async () => {
    authed.ok = true;
    proposals.create.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(503);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Proposal } from "@/lib/orcamento/types";
import { splitThirtySeventy } from "@/lib/money";

// ── Mock the auth + data layer + heavy PDF/mail side effects; keep the money
//    math (proposal-doc) and the route logic real ──
const created = vi.hoisted(() => ({ last: null as Proposal | null }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => ({ id, email: "cliente@example.com" })),
  updateQuote: vi.fn(async () => {}),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: vi.fn(async (p: Proposal) => {
    created.last = p;
  }),
}));
// The real renderer is server-only + rasterises a PDF; stub it to a byte or two.
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
}));
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: vi.fn(() => "tok") }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";

/** Minimal studio doc — only `ref` + `clientNames` are validated by the route;
 *  the money fields under test are added per-case. */
function baseDoc(over: Record<string, unknown> = {}) {
  return {
    template: "decoracao",
    ref: "PO Decoração Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    coverImages: [],
    ...over,
  };
}

function sendReq(doc: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "send", doc }),
  }) as unknown as NextRequest;
}

const params = Promise.resolve({ id: "q1" });

beforeEach(() => {
  created.last = null;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/proposta-doc — money model", () => {
  it('"+ IVA" (acrescer): grosses up the total so total = base × (1 + IVA)', async () => {
    // Structured: 3000 base, IVA acresce.
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000); // base
    expect(p.vat).toBe(690); // 3000 × 0.23
    expect(p.total).toBe(3690); // gross = base × 1.23
    // The sinal must be 30% of the GROSS, not of the net.
    expect(splitThirtySeventy(p.total).sinal).toBe(1107); // 3690 × 0.3
  });

  it('"incluido": keeps total = amount and back-derives the base', async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3690, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690); // gross unchanged
    expect(p.subtotal).toBe(3000); // 3690 / 1.23
    expect(p.vat).toBe(690);
    expect(splitThirtySeventy(p.total).sinal).toBe(1107);
  });

  it("legacy free-text fallback: detects '+ IVA' in totalText and grosses up", async () => {
    // No structured fields — only the old free-text total with a "+ IVA" note.
    const res = await POST(sendReq(baseDoc({ totalText: "3.000,00 € + IVA" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000);
    expect(p.total).toBe(3690);
  });

  it("legacy free-text without a note is treated as IVA-included", async () => {
    const res = await POST(sendReq(baseDoc({ totalText: "3.690,00 €" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690);
    expect(p.subtotal).toBe(3000);
  });

  it("sets a default validUntil (~30 days out) when the doc carries no date", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(p.validUntil!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(31);
  });
});

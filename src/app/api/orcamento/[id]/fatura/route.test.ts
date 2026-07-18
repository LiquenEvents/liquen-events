import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer + side effects; keep the route logic real ──
// An in-memory faturas ledger that actually persists across POSTs, so the
// idempotency path (listInvoicesForQuote → reuse) can be exercised end-to-end.
const ledger = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  idSeq: 0,
  numSeq: 0,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) =>
    id === "LIQ-1" ? { id, name: "Ana Silva", email: "ana@example.com", nif: "500000000" } : null,
  ),
}));
vi.mock("@/lib/invoices-store", () => ({
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    ledger.rows.filter((r) => r.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    ledger.rows.push(i);
  }),
  updateInvoice: vi.fn(async (rid: string, patch: Record<string, unknown>) => {
    const row = ledger.rows.find((r) => r.id === rid);
    if (!row) return null;
    Object.assign(row, patch);
    return row;
  }),
  nextInvoiceNumber: vi.fn(async () => `FT 2026/${String(++ledger.numSeq).padStart(4, "0")}`),
  newInvoiceId: vi.fn(() => `inv-${++ledger.idSeq}`),
}));
// Skip the real pdf-lib render (server-only + heavy) — bytes are irrelevant here.
vi.mock("@/lib/invoice-pdf", () => ({
  renderInvoicePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";
import { createInvoice, nextInvoiceNumber } from "@/lib/invoices-store";
import { renderInvoicePdf } from "@/lib/invoice-pdf";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/fatura", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  ledger.rows = [];
  ledger.idSeq = 0;
  ledger.numSeq = 0;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/fatura", () => {
  it("issues a real sequential ledger number (not a random one) and records the invoice", async () => {
    const res = await POST(
      req({ paymentId: "p-abc", kind: "pagamento", amount: 1230, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // Sequential FT AAAA/NNNN — never the old `YYYY/xxxx-nnn` random shape.
    expect(json.number).toMatch(/^FT \d{4}\/\d{4}$/);
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(1);

    // A ledger row was created, with the payment kind mapped to the invoice kind
    // (pagamento → total), the amount incl. IVA, and a paid status + paidAt.
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0]).toMatchObject({
      number: json.number,
      quoteId: "LIQ-1",
      kind: "total",
      amount: 1230,
      status: "paga",
      paidAt: "2026-07-18",
    });

    // The PDF is rendered FROM the persisted record → same number in both.
    expect(renderInvoicePdf).toHaveBeenCalledWith(
      expect.objectContaining({ number: json.number, amount: 1230, paid: true }),
    );
  });

  it("is idempotent: a second identical request reuses the number and does not duplicate the ledger row", async () => {
    const first = await POST(
      req({ paymentId: "p-xyz", kind: "sinal", amount: 3750, date: "2026-07-18", paid: false }),
      ctx("LIQ-1"),
    );
    const firstJson = await first.json();
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toHaveLength(1);

    const second = await POST(
      req({ paymentId: "p-xyz", kind: "sinal", amount: 3750, date: "2026-07-18", paid: false }),
      ctx("LIQ-1"),
    );
    const secondJson = await second.json();

    // No new number minted, no new ledger row — the existing record is re-rendered.
    expect(secondJson.number).toBe(firstJson.number);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toHaveLength(1);
  });

  it("rejects a non-positive amount with 400 and never touches the ledger", async () => {
    const res = await POST(req({ paymentId: "p-0", kind: "sinal", amount: 0 }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown quote", async () => {
    const res = await POST(req({ paymentId: "p-1", kind: "sinal", amount: 100 }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(createInvoice).not.toHaveBeenCalled();
  });
});

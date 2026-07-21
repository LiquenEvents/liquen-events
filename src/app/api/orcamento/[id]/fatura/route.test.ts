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

  it("reuses an auto-issued sinal (no [pag:] marker) instead of minting a second one (P0 #39)", async () => {
    // Auto-emitida no aceite da proposta: espécie sinal, SEM marcador [pag:],
    // ainda `emitida`. É o cenário exato do double-billing.
    ledger.rows.push({
      id: "auto-sinal",
      number: "FT 2026/0001",
      quoteId: "LIQ-1",
      kind: "sinal",
      amount: 3750,
      status: "emitida",
      note: "Sinal 30% — reserva de data (aceitação da proposta)",
    });

    // O painel emite o recibo dessa parcela — envia SEMPRE `paymentId`.
    const res = await POST(
      req({ paymentId: "pay-1", kind: "sinal", amount: 3750, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // Nenhum segundo sinal: mesmo número FT, sem nova linha, sem createInvoice
    // nem novo número de sequência.
    expect(json.number).toBe("FT 2026/0001");
    expect(createInvoice).not.toHaveBeenCalled();
    expect(nextInvoiceNumber).not.toHaveBeenCalled();
    expect(ledger.rows).toHaveLength(1);

    // O sinal existente passou a `paga` e ganhou o marcador de pagamento.
    expect(ledger.rows[0]).toMatchObject({ status: "paga", paidAt: "2026-07-18" });
    expect(String(ledger.rows[0].note)).toContain("[pag:pay-1]");
  });

  it("never mints a second sinal even if the receipt amount differs from the auto-issued one (#39)", async () => {
    ledger.rows.push({
      id: "auto-sinal",
      number: "FT 2026/0001",
      quoteId: "LIQ-1",
      kind: "sinal",
      amount: 3750,
      status: "emitida",
      note: "Sinal 30%",
    });
    const res = await POST(
      req({ paymentId: "pay-2", kind: "sinal", amount: 9999, paid: false }),
      ctx("LIQ-1"),
    );
    const json = await res.json();
    // A invariante é uma-por-espécie: reaproveita a existente, não cunha outra.
    expect(json.number).toBe("FT 2026/0001");
    expect(createInvoice).not.toHaveBeenCalled();
    expect(ledger.rows).toHaveLength(1);
  });

  it("does NOT resurrect an anulada sinal — mints a fresh one instead (fiscal: a voided doc stays voided)", async () => {
    // Um sinal foi ANULADO (voided). O painel emite depois o recibo do sinal.
    // Reaproveitar/ressuscitar a fatura anulada para `paga` é uma violação de
    // integridade fiscal: um documento anulado nunca volta à vida. Deve ser
    // cunhado um NOVO sinal (novo número), coerente com o índice parcial único
    // (anuladas ficam FORA) e com a rota /faturas.
    ledger.rows.push({
      id: "voided-sinal",
      number: "FT 2026/0001",
      quoteId: "LIQ-1",
      kind: "sinal",
      amount: 3750,
      status: "anulada",
      note: "Sinal 30% (anulado)",
    });

    const res = await POST(
      req({ paymentId: "pay-9", kind: "sinal", amount: 3750, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();

    // Uma fatura NOVA foi cunhada (novo número + createInvoice); a anulada
    // permanece anulada e intocada, não foi reaproveitada nem ressuscitada.
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    const voided = ledger.rows.find((r) => r.id === "voided-sinal");
    expect(voided?.status).toBe("anulada");
    expect(ledger.rows).toHaveLength(2);
    // A linha nova é distinta da anulada e ficou `paga`.
    const minted = ledger.rows.find((r) => r.id !== "voided-sinal");
    expect(minted?.status).toBe("paga");
  });

  it("reuses the ACTIVE sinal even when an older anulada sinal also exists", async () => {
    // Cenário misto: um sinal antigo anulado + um sinal ativo (reemitido). O
    // recibo tem de casar com o ATIVO, nunca com o anulado (ordem no ledger).
    ledger.rows.push({
      id: "old-voided",
      number: "FT 2026/0001",
      quoteId: "LIQ-1",
      kind: "sinal",
      amount: 3750,
      status: "anulada",
    });
    ledger.rows.push({
      id: "active-sinal",
      number: "FT 2026/0005",
      quoteId: "LIQ-1",
      kind: "sinal",
      amount: 3750,
      status: "emitida",
    });

    const res = await POST(
      req({ paymentId: "pay-a", kind: "sinal", amount: 3750, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    const json = await res.json();
    // Reaproveita o ativo (0005), não cunha nem ressuscita nada.
    expect(json.number).toBe("FT 2026/0005");
    expect(createInvoice).not.toHaveBeenCalled();
    expect(nextInvoiceNumber).not.toHaveBeenCalled();
    expect(ledger.rows.find((r) => r.id === "active-sinal")?.status).toBe("paga");
    expect(ledger.rows.find((r) => r.id === "old-voided")?.status).toBe("anulada");
  });

  it("does NOT resurrect an anulada total invoice matched by amount — mints a fresh one", async () => {
    // Fallback de dedup por espécie+valor no ramo total/pagamento: não deve casar
    // com uma fatura anulada de igual valor e trazê-la de volta a `paga`.
    ledger.rows.push({
      id: "voided-total",
      number: "FT 2026/0001",
      quoteId: "LIQ-1",
      kind: "total",
      amount: 1230,
      status: "anulada",
      note: "Pagamento (anulado)",
    });

    const res = await POST(
      req({ kind: "pagamento", amount: 1230, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    await res.json();
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.find((r) => r.id === "voided-total")?.status).toBe("anulada");
  });

  it("coerces a malformed date to today (yyyy-mm-dd) instead of persisting 'Invalid Date' (N13)", async () => {
    // A garbage `date` from the panel used to be stored verbatim and later fed
    // `new Date(date+"T12:00:00")` in the PDF → "Invalid Date" on the receipt.
    // It must now fall back to a valid yyyy-mm-dd (today) — never a raw bad string.
    const res = await POST(
      req({ paymentId: "p-bad", kind: "pagamento", amount: 500, date: "not-a-date", paid: true }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(ledger.rows).toHaveLength(1);

    const stored = String(ledger.rows[0].issuedAt);
    expect(stored).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(stored).not.toBe("not-a-date");
    // The derived paidAt must be a real date too, and the PDF renders a valid date.
    expect(String(ledger.rows[0].paidAt)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(renderInvoicePdf).toHaveBeenCalledWith(expect.objectContaining({ date: stored }));
    expect(Number.isNaN(new Date(`${stored}T12:00:00`).getTime())).toBe(false);
  });

  it("preserves a valid yyyy-mm-dd date exactly (does not clobber good input)", async () => {
    const res = await POST(
      req({ paymentId: "p-ok", kind: "pagamento", amount: 500, date: "2026-07-18", paid: true }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(ledger.rows[0]).toMatchObject({ issuedAt: "2026-07-18", paidAt: "2026-07-18" });
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer; keep the route logic + money math real ──
const invoicesDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
const proposalsDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));

vi.mock("@/lib/invoices-store", () => ({
  getInvoice: vi.fn(async (id: string) => invoicesDb.store.get(id) ?? null),
  updateInvoice: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const cur = invoicesDb.store.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    invoicesDb.store.set(id, next);
    return next;
  }),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    [...invoicesDb.store.values()].filter((i) => i.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    invoicesDb.store.set(i.id as string, i);
  }),
  newInvoiceId: vi.fn(() => `inv-${invoicesDb.store.size + 1}`),
  nextInvoiceNumber: vi.fn(async () => "FT 2026/0002"),
  // Real 30/70 split (saldo by subtraction), mirroring @/lib/money.
  splitThirtySeventy: (total: number) => {
    const sinal = Math.round(total * 0.3 * 100) / 100;
    return { sinal, saldo: Math.round((total - sinal) * 100) / 100 };
  },
}));

vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: vi.fn(async (quoteId: string) => proposalsDb.store.get(quoteId) ?? null),
}));

vi.mock("@/lib/money", () => ({ round2: (n: number) => Math.round(n * 100) / 100 }));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { PATCH } from "./route";
import { createInvoice, listInvoicesForQuote } from "@/lib/invoices-store";

function patchReq(
  id: string,
  body: unknown,
): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

function seedSinal(id: string, over: Record<string, unknown> = {}) {
  invoicesDb.store.set(id, {
    id,
    number: "FT 2026/0001",
    quoteId: `q-${id}`,
    clientName: "Cliente Teste",
    clientEmail: "cliente@example.com",
    kind: "sinal",
    amount: 3750, // 30% de 12500
    vatRate: 0.23,
    issuedAt: "2026-07-01",
    status: "emitida",
    ...over,
  });
}

beforeEach(() => {
  invoicesDb.store.clear();
  proposalsDb.store.clear();
  vi.clearAllMocks();
});

describe("PATCH /api/faturas/[id] — auto-saldo on sinal paid", () => {
  it("marking a sinal paga auto-issues a saldo (kind + amount from the proposal total)", async () => {
    seedSinal("s1");
    proposalsDb.store.set("q-s1", { total: 12500 });

    const { req, params } = patchReq("s1", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();

    // The updated sinal is returned, with the created saldo attached for the UI.
    expect(json).toMatchObject({ id: "s1", kind: "sinal", status: "paga" });
    expect(json.saldoAutoIssued).toMatchObject({
      kind: "saldo",
      amount: 8750, // 70% de 12500
      vatRate: 0.23,
      status: "emitida",
      quoteId: "q-s1",
      note: "Saldo 70% — remanescente após sinal",
    });
    // dueAt defaults to +30 days from issuedAt.
    expect(json.saldoAutoIssued.dueAt).toBeTruthy();
    expect(json.saldoAutoIssued.dueAt).not.toBe(json.saldoAutoIssued.issuedAt);

    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("falls back to deriving the saldo from the sinal amount when no proposal exists", async () => {
    seedSinal("s2"); // no proposal seeded → saldo = 3750 / 3 * 7
    const { req, params } = patchReq("s2", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
  });

  it("is idempotent: no second saldo when one already exists for the quote", async () => {
    seedSinal("s3");
    // A saldo already sits in the ledger for this quote.
    invoicesDb.store.set("existing-saldo", {
      id: "existing-saldo",
      quoteId: "q-s3",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });

    const { req, params } = patchReq("s3", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();

    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("derives the saldo from the billed sinal, ignoring a differing newest-proposal total (#41)", async () => {
    seedSinal("s7"); // sinal €3750
    // Proposta revista APÓS o aceite: total maior ⇒ o saldo 70% da proposta seria
    // €14000. Não deve ser usado — a fonte de verdade é o sinal já faturado.
    proposalsDb.store.set("q-s7", { total: 20000 });

    const { req, params } = patchReq("s7", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    // 3750 / 3 * 7 = 8750, e NÃO 14000 (70% de 20000).
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
  });

  it("annuls an unpaid auto-saldo when the sinal is reverted from paga (#41)", async () => {
    seedSinal("s8", { status: "paga", paidAt: "2026-07-05" });
    // Saldo órfão auto-emitido, ainda por pagar.
    invoicesDb.store.set("saldo-8", {
      id: "saldo-8",
      quoteId: "q-s8",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });

    const { req, params } = patchReq("s8", { status: "emitida" }); // paga → emitida
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json).toMatchObject({ id: "s8", status: "emitida" });
    // O saldo órfão foi anulado (não fica a estrangular o livro).
    expect(json.saldoAnnulled).toMatchObject({ id: "saldo-8", kind: "saldo", status: "anulada" });
    expect(invoicesDb.store.get("saldo-8")?.status).toBe("anulada");
  });

  it("does NOT annul a saldo that is already paga when the sinal is reverted (#41)", async () => {
    seedSinal("s9", { status: "paga", paidAt: "2026-07-05" });
    invoicesDb.store.set("saldo-9", {
      id: "saldo-9",
      quoteId: "q-s9",
      kind: "saldo",
      amount: 8750,
      status: "paga", // dinheiro real entrou — não se toca
    });

    const { req, params } = patchReq("s9", { status: "emitida" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAnnulled).toBeUndefined();
    expect(invoicesDb.store.get("saldo-9")?.status).toBe("paga");
  });

  it("re-issues a fresh saldo after an orphan was annulled (guard ignores anulada) (#41)", async () => {
    seedSinal("s10");
    // Um saldo anulado (órfão de uma reversão anterior) NÃO deve bloquear a
    // reemissão quando o sinal corrigido volta a ser pago.
    invoicesDb.store.set("saldo-10", {
      id: "saldo-10",
      quoteId: "q-s10",
      kind: "saldo",
      amount: 8750,
      status: "anulada",
    });

    const { req, params } = patchReq("s10", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-issue for a non-sinal invoice", async () => {
    seedSinal("t1", { kind: "total" });
    const { req, params } = patchReq("t1", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
    // We never even look up the quote's ledger for a non-transition.
    expect(listInvoicesForQuote).not.toHaveBeenCalled();
  });

  it("does NOT auto-issue when the sinal was already paga (no transition)", async () => {
    seedSinal("s4", { status: "paga", paidAt: "2026-07-05" });
    // A re-PATCH that keeps it paga (e.g. editing the note) must not re-trigger.
    const { req, params } = patchReq("s4", { status: "paga", note: "edição" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("does NOT auto-issue for edits that don't move the sinal to paga", async () => {
    seedSinal("s5");
    const { req, params } = patchReq("s5", { note: "só uma nota" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("marking paga still succeeds even if saldo creation throws (best-effort)", async () => {
    seedSinal("s6");
    proposalsDb.store.set("q-s6", { total: 12500 });
    vi.mocked(createInvoice).mockRejectedValueOnce(new Error("db down"));

    const { req, params } = patchReq("s6", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    // The sinal is still marked paid; no saldo attached because creation failed.
    expect(json).toMatchObject({ id: "s6", status: "paga" });
    expect(json.saldoAutoIssued).toBeUndefined();
  });
});

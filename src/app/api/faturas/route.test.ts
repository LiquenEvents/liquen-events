import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer; keep the route logic + money math real ──
// An in-memory ledger that persists across the request so the duplicate-sinal
// guard (listInvoicesForQuote → reject) can be exercised end-to-end.
const ledger = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  idSeq: 0,
  numSeq: 0,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/invoices-store", () => ({
  listInvoices: vi.fn(async () => ledger.rows),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    ledger.rows.filter((r) => r.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    ledger.rows.push(i);
  }),
  nextInvoiceNumber: vi.fn(async () => `FT 2026/${String(++ledger.numSeq).padStart(4, "0")}`),
  newInvoiceId: vi.fn(() => `inv-${++ledger.idSeq}`),
  // Real 30/70 split (saldo by subtraction), mirroring @/lib/money.
  splitThirtySeventy: (total: number) => {
    const sinal = Math.round(total * 0.3 * 100) / 100;
    return { sinal, saldo: Math.round((total - sinal) * 100) / 100 };
  },
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";
import { createInvoice } from "@/lib/invoices-store";

function req(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function seedInvoice(over: Record<string, unknown>) {
  ledger.rows.push({
    id: `seed-${ledger.rows.length + 1}`,
    number: "FT 2026/0001",
    quoteId: "q-1",
    clientName: "Cliente",
    kind: "sinal",
    amount: 3000,
    status: "emitida",
    ...over,
  });
}

beforeEach(() => {
  ledger.rows = [];
  ledger.idSeq = 0;
  ledger.numSeq = 0;
  vi.clearAllMocks();
});

describe("POST /api/faturas — split path duplicate-sinal guard", () => {
  it("issues the sinal + saldo pair when the event has no prior invoices", async () => {
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices).toHaveLength(2);
    expect(json.invoices.map((i: { kind: string }) => i.kind)).toEqual(["sinal", "saldo"]);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it("rejects with 409 when a non-anulada sinal already exists (no double-issue)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
    expect(json.error).toContain("FT 2026/0001"); // surfaces the existing number
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a non-anulada saldo already exists", async () => {
    seedInvoice({ kind: "saldo", number: "FT 2026/0002", status: "emitida" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de saldo");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("still issues when the only prior sinal is anulada (guard ignores anulada)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "anulada" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it("does not block the split when no quoteId is provided (guard is per-event)", async () => {
    // A prior sinal on some quote must not leak into an unlinked manual split.
    seedInvoice({ kind: "sinal", quoteId: "q-1", status: "emitida" });
    const res = await POST(req({ split: true, clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/faturas — single-invoice duplicate-sinal/saldo guard (FIX 1)", () => {
  it("rejects a single Tipo=Sinal when a non-anulada sinal already exists", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
    expect(json.error).toContain("FT 2026/0001"); // surfaces the existing number
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a single Tipo=Saldo when a non-anulada saldo already exists", async () => {
    seedInvoice({ kind: "saldo", number: "FT 2026/0007", status: "paga" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 7000, kind: "saldo" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de saldo");
    expect(json.error).toContain("FT 2026/0007");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("issues a single sinal when the only prior one is anulada (guard ignores anulada)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "anulada" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("never blocks a single Tipo=Total even when a sinal/saldo exists", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 9000, kind: "total" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("does not block a single sinal when no quoteId is provided (guard is per-event)", async () => {
    seedInvoice({ kind: "sinal", quoteId: "q-1", status: "emitida" });
    const res = await POST(req({ clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });
});

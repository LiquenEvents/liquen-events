import { describe, it, expect } from "vitest";
import {
  computeEventMetrics,
  reconcileFinance,
  type DossierData,
  type DossierInvoice,
} from "./dossier";
import type { Quote, Payment } from "./types";

/**
 * Adversarial QA — the FINANCEIRO / MARGIN math shared by the Estatísticas
 * dashboard (margem por tipo de evento) and the Dossier. StatsDashboard, Overview
 * and EventCosts all aggregate the SAME per-event building blocks that
 * `computeEventMetrics`/`reconcileFinance` expose, so pinning these pure helpers
 * pins the reporting math too. Every test injects a fixed `today` — never the
 * real clock. Focus: division-by-zero receita, negative margin (custo > receita),
 * anulada exclusion, float drift in cent sums, empty state (no NaN/Infinity) and
 * sinal/saldo/total ledger coherence.
 */

const TODAY = new Date("2026-07-18T09:00:00Z");

/** Minimal quote; tests override only what they exercise. */
function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "aceite",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Evento teste",
    date: "2026-09-12",
    endDate: "",
    location: "Lisboa",
    locationType: "lisboa",
    guests: 80,
    duration: 6,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    name: "Ana Cliente",
    email: "ana@example.com",
    phone: "912345678",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    priceBreakdown: {
      basePrice: 0,
      guestCost: 0,
      packageMultiplier: 1,
      locationSurcharge: 0,
      weekendSurcharge: 0,
      seasonSurcharge: 0,
      urgencySurcharge: 0,
      addonsCost: 0,
      subtotal: 10000,
      iva: 2300,
      total: 12300,
      rangeMin: 12000,
      rangeMax: 13000,
      isEstimate: false,
    },
    ...over,
  };
}

function invoice(over: Partial<DossierInvoice> = {}): DossierInvoice {
  return {
    id: "i1",
    number: "FT 2026/0001",
    kind: "sinal",
    amount: 6000,
    status: "emitida",
    issuedAt: "2026-02-05",
    ...over,
  };
}

function data(over: Partial<DossierData> = {}): DossierData {
  return { quote: makeQuote(), proposal: null, contract: null, invoices: [], ...over };
}

describe("computeEventMetrics — margin adversarial edges", () => {
  it("custo > receita → margin is NEGATIVE (never clamped) and pctPaid stays finite", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: 5000,
        priceBreakdown: undefined as never,
        eventSuppliers: [
          {
            id: "s1",
            name: "Catering caro",
            category: "catering",
            estimatedCost: 8000,
            status: "confirmado",
          },
        ],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(5000);
    expect(m.supplierCosts).toBe(8000);
    expect(m.margin).toBe(-3000); // receita − custo, honestly negative
    expect(Number.isFinite(m.margin)).toBe(true);
    expect(m.pctPaid).toBe(0); // nothing paid, no divide-by-zero
  });

  it("ZERO receita (no proposal/quote/breakdown) → no NaN/Infinity anywhere", () => {
    const d = data({
      quote: makeQuote({ quotedPrice: undefined, priceBreakdown: undefined as never }),
      invoices: [invoice({ status: "paga", amount: 500 })],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(0);
    expect(m.pctPaid).toBe(0); // guard: contracted 0 → 0, NOT 500/0 = Infinity
    expect(Number.isFinite(m.pctPaid)).toBe(true);
    expect(m.margin).toBe(0);
    expect(Number.isNaN(m.margin)).toBe(false);
  });

  it("fully empty event → every metric is a finite 0 (empty-state safety)", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: undefined,
        priceBreakdown: undefined as never,
        eventSuppliers: [],
        guestList: [],
        payments: [],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    for (const v of [
      m.contracted,
      m.ledgerIssued,
      m.ledgerPaid,
      m.informalPaid,
      m.pctPaid,
      m.supplierCosts,
      m.margin,
      m.rsvpConfirmed,
      m.rsvpTotal,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(m.margin).toBe(0);
  });

  it("overpaid ledger → pctPaid exceeds 1 (coherent, not capped)", () => {
    const d = data({
      quote: makeQuote({ quotedPrice: 20000, priceBreakdown: undefined as never }),
      invoices: [invoice({ kind: "total", amount: 25000, status: "paga" })],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.ledgerPaid).toBe(25000);
    expect(m.pctPaid).toBeCloseTo(1.25, 10);
  });
});

describe("computeEventMetrics — ledger sinal/saldo/total coherence", () => {
  it("anulada invoices are excluded from BOTH ledgerIssued and ledgerPaid", () => {
    const d = data({
      quote: makeQuote({ quotedPrice: 20000, priceBreakdown: undefined as never }),
      invoices: [
        invoice({ id: "i1", kind: "sinal", amount: 6000, status: "paga" }),
        invoice({ id: "i2", kind: "saldo", amount: 14000, status: "anulada" }), // voided
      ],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.ledgerIssued).toBe(6000); // voided saldo not issued
    expect(m.ledgerPaid).toBe(6000); // and certainly not paid
    expect(m.pctPaid).toBeCloseTo(0.3, 10);
  });

  it("an EMITIDA (issued-but-unpaid) invoice counts as issued but NOT as paid", () => {
    const d = data({
      quote: makeQuote({ quotedPrice: 20000, priceBreakdown: undefined as never }),
      invoices: [
        invoice({ id: "i1", kind: "sinal", amount: 6000, status: "paga" }),
        invoice({ id: "i2", kind: "saldo", amount: 14000, status: "emitida" }),
      ],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.ledgerIssued).toBe(20000);
    expect(m.ledgerPaid).toBe(6000); // saldo issued but unpaid
  });
});

describe("computeEventMetrics — aggregation invariant (the Estatísticas sum)", () => {
  it("summing per-event margins equals sum(contracted) − sum(costs), across mixed +/− events", () => {
    // Mirrors the StatsDashboard 'margem por tipo de evento' fold: it accumulates
    // computeEventMetrics().margin/contracted/supplierCosts per accepted event.
    const quotes = [
      makeQuote({
        id: "a",
        quotedPrice: 20000,
        priceBreakdown: undefined as never,
        eventSuppliers: [
          { id: "s", name: "x", category: "c", estimatedCost: 12000, status: "pago" },
        ],
      }),
      makeQuote({
        id: "b",
        quotedPrice: 5000,
        priceBreakdown: undefined as never,
        eventSuppliers: [
          { id: "s", name: "x", category: "c", estimatedCost: 8000, status: "pago" },
        ],
      }), // loss-maker
      makeQuote({
        id: "c",
        quotedPrice: 10000,
        priceBreakdown: undefined as never,
        eventSuppliers: [],
      }), // no costs
    ];
    let sumContracted = 0,
      sumCosts = 0,
      sumMargin = 0;
    for (const q of quotes) {
      const m = computeEventMetrics(
        { quote: q, proposal: null, contract: null, invoices: [] },
        TODAY,
      );
      sumContracted += m.contracted;
      sumCosts += m.supplierCosts;
      sumMargin += m.margin;
    }
    expect(sumContracted).toBe(35000);
    expect(sumCosts).toBe(20000);
    expect(sumMargin).toBe(15000);
    expect(sumMargin).toBe(sumContracted - sumCosts); // fold stays coherent with a −3000 event mixed in
  });
});

describe("reconcileFinance — cent-level truth, no false alarms", () => {
  it("float-drift cent sums do NOT trigger a spurious divergence (round2 both sides)", () => {
    // 0.10 + 0.20 = 0.30000000000000004 in IEEE-754. A naive === against a single
    // 0.30 invoice would flag a bogus reconciliation warning; round2 must absorb it.
    const payments: Payment[] = [
      { id: "p1", kind: "sinal", amount: 0.1, date: "2026-02-01", paid: true },
      { id: "p2", kind: "pagamento", amount: 0.2, date: "2026-02-02", paid: true },
    ];
    const d = data({
      quote: makeQuote({ payments }),
      invoices: [invoice({ kind: "sinal", amount: 0.3, status: "paga" })],
    });
    const r = reconcileFinance(d);
    expect(r.informalPaid).toBe(0.3);
    expect(r.ledgerPaid).toBe(0.3);
    expect(r.diverges).toBe(false);
  });

  it("only PAID informal payments and PAGA invoices count toward each side", () => {
    const payments: Payment[] = [
      { id: "p1", kind: "sinal", amount: 6000, date: "2026-02-01", paid: true },
      { id: "p2", kind: "saldo", amount: 14000, date: "2026-05-01", paid: false }, // pending
    ];
    const d = data({
      quote: makeQuote({ payments }),
      invoices: [
        invoice({ id: "i1", kind: "sinal", amount: 6000, status: "paga" }),
        invoice({ id: "i2", kind: "saldo", amount: 14000, status: "emitida" }), // not paid
      ],
    });
    const r = reconcileFinance(d);
    expect(r.informalPaid).toBe(6000);
    expect(r.ledgerPaid).toBe(6000);
    expect(r.diverges).toBe(false);
  });

  it("genuine mismatch still surfaces (informal ahead of the ledger)", () => {
    const payments: Payment[] = [
      { id: "p1", kind: "sinal", amount: 6000, date: "2026-02-01", paid: true },
    ];
    const d = data({ quote: makeQuote({ payments }), invoices: [] });
    const r = reconcileFinance(d);
    expect(r.informalPaid).toBe(6000);
    expect(r.ledgerPaid).toBe(0);
    expect(r.diverges).toBe(true);
  });
});

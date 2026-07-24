import { describe, it, expect } from "vitest";
import {
  contractedAmounts,
  effectiveVatRate,
  computeEventMetrics,
  type DossierData,
} from "./dossier";
import type { Quote } from "./types";

/**
 * The contracted value the client actually pays is GROSS (com IVA), while the
 * "Preço final (sem IVA)" field (`quotedPrice`) is NET. Payments and invoices are
 * gross, so "em falta" must compare gross with gross. These tests pin the
 * net/IVA/gross decomposition and the effective-rate derivation. Legacy
 * `metrics.contracted` is intentionally left unchanged (stats/adversarial tests
 * depend on it), so we also assert the new fields are ADDITIVE.
 */

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

describe("effectiveVatRate", () => {
  it("derives the rate from the breakdown (iva / subtotal)", () => {
    expect(effectiveVatRate(makeQuote())).toBeCloseTo(0.23, 10);
  });
  it("falls back to 23% when there is no usable breakdown", () => {
    expect(effectiveVatRate(makeQuote({ priceBreakdown: undefined as never }))).toBe(0.23);
  });
});

describe("contractedAmounts", () => {
  it("treats quotedPrice as NET and derives the gross the client pays", () => {
    const q = makeQuote({ quotedPrice: 5000, priceBreakdown: undefined as never });
    const a = contractedAmounts(q);
    expect(a.net).toBe(5000);
    expect(a.gross).toBe(6150); // 5000 * 1.23
    expect(a.iva).toBe(1150);
    expect(a.net + a.iva).toBe(a.gross);
  });

  it("uses the breakdown's own rate for a manual price when present", () => {
    // subtotal 20000 / iva 1200 → 6% effective rate.
    const q = makeQuote({
      quotedPrice: 1000,
      priceBreakdown: { ...makeQuote().priceBreakdown, subtotal: 20000, iva: 1200, total: 21200 },
    });
    const a = contractedAmounts(q);
    expect(a.net).toBe(1000);
    expect(a.gross).toBe(1060); // 1000 * 1.06
  });

  it("reads the three parcels straight from a proposal (already gross-aware)", () => {
    const q = makeQuote({ quotedPrice: 5000 });
    const proposal = { total: 9840, subtotal: 8000, vat: 1840, vatRate: 0.23 } as never;
    const a = contractedAmounts(q, proposal);
    expect(a).toEqual({ net: 8000, iva: 1840, gross: 9840 });
  });

  it("falls back to the priceBreakdown when there is no quotedPrice/proposal", () => {
    const a = contractedAmounts(makeQuote({ quotedPrice: undefined }));
    expect(a).toEqual({ net: 10000, iva: 2300, gross: 12300 });
  });

  it("is all-zero for an empty event (no NaN)", () => {
    const a = contractedAmounts(
      makeQuote({ quotedPrice: undefined, priceBreakdown: undefined as never }),
    );
    expect(a).toEqual({ net: 0, iva: 0, gross: 0 });
    for (const v of [a.net, a.iva, a.gross]) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("computeEventMetrics — additive gross fields", () => {
  it("exposes contractedGross (com IVA) without changing legacy `contracted`", () => {
    const d: DossierData = {
      quote: makeQuote({ quotedPrice: 5000, priceBreakdown: undefined as never }),
      proposal: null,
      contract: null,
      invoices: [],
    };
    const m = computeEventMetrics(d, new Date("2026-07-18T09:00:00Z"));
    // Legacy field stays the raw quotedPrice (net) — stats/adversarial contract.
    expect(m.contracted).toBe(5000);
    // New fields carry the corrected, gross-aware decomposition.
    expect(m.contractedNet).toBe(5000);
    expect(m.contractedGross).toBe(6150);
    expect(m.contractedIva).toBe(1150);
  });
});

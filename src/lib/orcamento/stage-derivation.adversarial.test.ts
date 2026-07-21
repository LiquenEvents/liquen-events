import { describe, it, expect } from "vitest";
import { deriveStage, type DossierData, type EventStage } from "./dossier";
import type { Quote, Proposal } from "./types";

/**
 * ADVERSARIAL cobertura da máquina de estados `deriveStage`.
 *
 * Foco: coerência da fase quando os sinais chegam pelo PRÓPRIO `quote.status`
 * (não só por uma Proposal/Contract). O `deriveStage` já honra
 * `quote.status === "cotado"` e `"rejeitado"` como fallbacks sem objeto
 * proposta — mas faltava-lhe `"aceite"`, deixando um negócio ganho manualmente
 * (sem proposta nem contrato) a aparecer como `lead`, contradizendo o
 * `deriveRequestLifecycle` do stepper para o MESMO pedido.
 *
 * Todos os testes injectam um `today` fixo — nunca dependem do relógio real.
 */

const TODAY = new Date("2026-07-18T09:00:00Z");

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "pendente",
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

function makeProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
    quoteId: "q1",
    clientName: "Ana Cliente",
    clientEmail: "ana@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 16260,
    vat: 3740,
    total: 20000,
    status: "enviada",
    createdAt: "2026-02-01T10:00:00Z",
    sentAt: "2026-02-01T10:00:00Z",
    ...over,
  };
}

function data(over: Partial<DossierData> = {}): DossierData {
  return {
    quote: makeQuote(),
    proposal: null,
    contract: null,
    invoices: [],
    ...over,
  };
}

describe("deriveStage — quote.status as a first-class won signal", () => {
  it("quote marked 'aceite' with NO proposal/contract is at least 'aceite', not 'lead'", () => {
    // Deal booked/won directly in the admin (offline booking): the store allows
    // pendente → aceite with no proposal row (see quotes-store 'illegal status
    // jump'), and followups treats such quotes as booked events. The dossier must
    // agree with the stepper's deriveRequestLifecycle (which counts status
    // 'aceite' as contract-accepted), instead of showing a won deal as a fresh lead.
    const d = data({ quote: makeQuote({ status: "aceite" }) });
    expect(deriveStage(d, TODAY)).toBe<EventStage>("aceite");
  });

  it("won quote with a paid sinal payment reaches 'em_producao'", () => {
    const d = data({
      quote: makeQuote({
        status: "aceite",
        payments: [{ id: "pay1", kind: "sinal", amount: 6000, date: "2026-02-10", paid: true }],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("won quote whose event is within 7 days reaches 'semana_evento'", () => {
    const d = data({ quote: makeQuote({ status: "aceite", date: "2026-07-22" }) });
    expect(deriveStage(d, TODAY)).toBe("semana_evento");
  });

  it("won quote, event passed, saldo paid → 'concluido'", () => {
    const d = data({
      quote: makeQuote({ status: "aceite", date: "2026-07-01", quotedPrice: 20000 }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0002",
          kind: "saldo",
          amount: 20000,
          status: "paga",
          issuedAt: "2026-06-10",
        },
      ],
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("rejeitado still wins even when the quote also carries 'aceite' history via proposal", () => {
    // Terminal 'perdido' precedence must not regress with the new won signal.
    const d = data({
      quote: makeQuote({ status: "rejeitado" }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });

  it("em_revisao (still triaging, no proposal) stays 'lead'", () => {
    // Guard the fix does not over-reach: only 'aceite' is a won signal.
    expect(deriveStage(data({ quote: makeQuote({ status: "em_revisao" }) }), TODAY)).toBe("lead");
  });
});

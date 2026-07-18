import { describe, it, expect } from "vitest";
import {
  deriveStage,
  computeEventMetrics,
  reconcileFinance,
  nextAction,
  countdownDays,
  type DossierData,
  type DossierInvoice,
  type EventStage,
} from "./dossier";
import type { Quote, Proposal, Payment, EventSupplier, Guest } from "./types";

/**
 * O modelo de domínio do Dossier é puro, por isso ganha cobertura exaustiva: a
 * máquina de estados `deriveStage` (toda a tabela, lead → concluído + perdido),
 * as métricas com IVA e a reconciliação livro-de-faturas vs pagamentos informais.
 * Todos os testes injectam um `today` fixo — nunca dependem do relógio real.
 */

// "Hoje" fixo para todos os testes de contagem/fase.
const TODAY = new Date("2026-07-18T09:00:00Z");

/** Quote mínima válida; os testes sobrepõem só os campos relevantes. */
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
  return {
    quote: makeQuote(),
    proposal: null,
    contract: null,
    invoices: [],
    ...over,
  };
}

describe("countdownDays", () => {
  it("is 0 on the event day, positive before, negative after, null when no date", () => {
    expect(countdownDays("2026-07-18", TODAY)).toBe(0);
    expect(countdownDays("2026-07-25", TODAY)).toBe(7);
    expect(countdownDays("2026-07-10", TODAY)).toBe(-8);
    expect(countdownDays(undefined, TODAY)).toBeNull();
    expect(countdownDays("lixo", TODAY)).toBeNull();
  });
});

describe("deriveStage", () => {
  const paidSinalPayment: Payment = {
    id: "pay1",
    kind: "sinal",
    amount: 6000,
    date: "2026-02-10",
    paid: true,
  };

  it("lead: fresh quote, no proposal", () => {
    expect(deriveStage(data(), TODAY)).toBe<EventStage>("lead");
  });

  it("proposta_enviada: proposal sent (not draft)", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "enviada" }) }), TODAY)).toBe(
      "proposta_enviada",
    );
  });

  it("proposta_enviada: quote marked cotado even without a proposal row", () => {
    expect(deriveStage(data({ quote: makeQuote({ status: "cotado" }) }), TODAY)).toBe(
      "proposta_enviada",
    );
  });

  it("aceite: proposal accepted, no sinal yet", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "aceite" }) }), TODAY)).toBe(
      "aceite",
    );
  });

  it("aceite: contract acceptedAt set counts as accepted", () => {
    const d = data({
      proposal: makeProposal({ status: "enviada" }),
      contract: { status: "aceite", acceptedAt: "2026-03-01T12:00:00Z" },
    });
    expect(deriveStage(d, TODAY)).toBe("aceite");
  });

  it("sinal_pago: informal sinal payment paid, but not accepted", () => {
    const d = data({ quote: makeQuote({ payments: [paidSinalPayment] }) });
    expect(deriveStage(d, TODAY)).toBe("sinal_pago");
  });

  it("em_producao: accepted AND sinal paid (via paid sinal invoice)", () => {
    const d = data({
      proposal: makeProposal({ status: "aceite" }),
      invoices: [invoice({ kind: "sinal", status: "paga" })],
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("semana_evento: accepted, event within 7 days, not passed", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-22", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("semana_evento");
  });

  it("concluido: event passed AND saldo paid", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-01" }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
      invoices: [invoice({ kind: "saldo", amount: 14000, status: "paga" })],
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("concluido: event passed and ledgerPaid >= contracted total", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-01" }),
      proposal: makeProposal({ status: "aceite", total: 20000 }),
      invoices: [
        invoice({ kind: "sinal", amount: 6000, status: "paga" }),
        invoice({ id: "i2", kind: "saldo", amount: 14000, status: "paga" }),
      ],
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("perdido: quote rejeitado wins over everything", () => {
    const d = data({
      quote: makeQuote({ status: "rejeitado", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });

  it("perdido: proposal rejeitada", () => {
    expect(deriveStage(data({ proposal: makeProposal({ status: "rejeitada" }) }), TODAY)).toBe(
      "perdido",
    );
  });

  it("event passed but saldo NOT paid does not reach concluido", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-01", payments: [paidSinalPayment] }),
      proposal: makeProposal({ status: "aceite" }),
    });
    // Accepted + sinal paid, event passed but unpaid saldo → still em_producao.
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });
});

describe("computeEventMetrics", () => {
  const suppliers: EventSupplier[] = [
    {
      id: "s1",
      name: "Catering",
      category: "catering",
      estimatedCost: 4000,
      actualCost: 4200,
      status: "confirmado",
    },
    { id: "s2", name: "Flores", category: "decor", estimatedCost: 1500, status: "contactado" },
  ];
  const guests: Guest[] = [
    { id: "g1", name: "Família A", party: 4, rsvp: "confirmado" },
    { id: "g2", name: "Família B", party: 3, rsvp: "pendente" },
    { id: "g3", name: "Amigo C", party: 2, rsvp: "confirmado" },
  ];

  it("computes contracted, ledger, margin, rsvp and countdown with IVA", () => {
    const d = data({
      quote: makeQuote({ date: "2026-07-25", eventSuppliers: suppliers, guestList: guests }),
      proposal: makeProposal({ total: 20000 }),
      invoices: [
        invoice({ kind: "sinal", amount: 6000, status: "paga" }),
        invoice({ id: "i2", kind: "saldo", amount: 14000, status: "emitida" }),
      ],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(20000);
    expect(m.ledgerIssued).toBe(20000); // both non-anulada
    expect(m.ledgerPaid).toBe(6000);
    expect(m.pctPaid).toBeCloseTo(0.3, 5);
    expect(m.supplierCosts).toBe(4200 + 1500); // actualCost ?? estimatedCost
    expect(m.margin).toBe(20000 - 5700);
    expect(m.countdownDays).toBe(7);
    expect(m.rsvpConfirmed).toBe(6);
    expect(m.rsvpTotal).toBe(9);
  });

  it("excludes anulada invoices from ledgerIssued; pctPaid is 0 when nothing contracted", () => {
    const d = data({
      quote: makeQuote({ quotedPrice: undefined, priceBreakdown: undefined as never }),
      invoices: [invoice({ status: "anulada", amount: 999 })],
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(0);
    expect(m.ledgerIssued).toBe(0);
    expect(m.pctPaid).toBe(0);
  });

  it("falls back quotedPrice → priceBreakdown.total when no proposal", () => {
    expect(
      computeEventMetrics(data({ quote: makeQuote({ quotedPrice: 15000 }) }), TODAY).contracted,
    ).toBe(15000);
    expect(computeEventMetrics(data(), TODAY).contracted).toBe(12300); // priceBreakdown.total
  });
});

describe("reconcileFinance", () => {
  it("diverges when informal payments do not match the ledger", () => {
    const d = data({
      quote: makeQuote({
        payments: [{ id: "p", kind: "sinal", amount: 6000, date: "2026-02-10", paid: true }],
      }),
      invoices: [], // nothing issued in the ledger
    });
    const r = reconcileFinance(d);
    expect(r.informalPaid).toBe(6000);
    expect(r.ledgerPaid).toBe(0);
    expect(r.diverges).toBe(true);
  });

  it("agrees (no divergence) when both sides match to the cent", () => {
    const d = data({
      quote: makeQuote({
        payments: [{ id: "p", kind: "sinal", amount: 6000, date: "2026-02-10", paid: true }],
      }),
      invoices: [invoice({ kind: "sinal", amount: 6000, status: "paga" })],
    });
    expect(reconcileFinance(d).diverges).toBe(false);
  });

  it("does not diverge when both sides are empty", () => {
    expect(reconcileFinance(data()).diverges).toBe(false);
  });
});

describe("nextAction", () => {
  it("maps each stage to a sensible kind", () => {
    expect(nextAction("lead", data(), TODAY).kind).toBe("proposta");
    expect(nextAction("proposta_enviada", data(), TODAY).kind).toBe("portal");
    expect(nextAction("aceite", data(), TODAY).kind).toBe("fatura_sinal");
    expect(nextAction("sinal_pago", data(), TODAY).kind).toBe("producao");
    expect(nextAction("em_producao", data(), TODAY).kind).toBe("producao");
    expect(nextAction("concluido", data(), TODAY).kind).toBe("arquivar");
    expect(nextAction("perdido", data(), TODAY).kind).toBe("none");
  });

  it("semana_evento distinguishes unpaid saldo (fatura_saldo) from fully paid (runsheet)", () => {
    const unpaid = data({ proposal: makeProposal({ total: 20000 }), invoices: [] });
    expect(nextAction("semana_evento", unpaid, TODAY).kind).toBe("fatura_saldo");

    const paid = data({
      proposal: makeProposal({ total: 20000 }),
      invoices: [invoice({ kind: "total", amount: 20000, status: "paga" })],
    });
    expect(nextAction("semana_evento", paid, TODAY).kind).toBe("runsheet");
  });
});

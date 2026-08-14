import { describe, it, expect } from "vitest";
import { computeEventMetrics, paidTotal, type DossierData } from "./dossier";
import type { Quote, Payment } from "./types";

/**
 * Adversarial QA — the FINANCEIRO / MARGIN math shared by the Estatísticas
 * dashboard (margem por tipo de evento) and the Dossier. StatsDashboard, Overview
 * and EventCosts all aggregate the SAME per-event building blocks that
 * `computeEventMetrics`/`paidTotal` expose, so pinning these pure helpers pins
 * the reporting math too. Every test injects a fixed `today` — never the real
 * clock. Focus: division-by-zero receita, negative margin (custo > receita),
 * float drift in cent sums, empty state (no NaN/Infinity) and the sinal/saldo
 * coherence of the payments record.
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

/** Linha de pagamento RECEBIDA; os testes sobrepõem só o que exercitam. */
function pago(over: Partial<Payment> = {}): Payment {
  return { id: "p1", kind: "sinal", amount: 6000, date: "2026-02-05", paid: true, ...over };
}

function data(over: Partial<DossierData> = {}): DossierData {
  return { quote: makeQuote(), proposal: null, contract: null, ...over };
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
    // 5 000 € é o preço SEM IVA; contratado = 6 150 € com IVA, que é a base em
    // que os pagamentos se comparam. A MARGEM, essa, corre em
    // líquido dos dois lados — o IVA não é receita nem é custo (ver a nota em
    // `EventMetrics.margin`): 5 000 − 6 504,07 = −1 504,07 €.
    expect(m.contracted).toBe(6150);
    expect(m.supplierCosts).toBe(8000);
    expect(m.supplierCostsNet).toBe(6504.07);
    expect(m.margin).toBe(-1504.07); // receita − custo, honestamente negativa
    expect(Number.isFinite(m.margin)).toBe(true);
    expect(m.pctPaid).toBe(0); // nothing paid, no divide-by-zero
  });

  it("ZERO receita (no proposal/quote/breakdown) → no NaN/Infinity anywhere", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: undefined,
        priceBreakdown: undefined as never,
        payments: [pago({ amount: 500 })],
      }),
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
      m.paid,
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

  it("recebido acima do contratado → pctPaid passa de 1 (coerente, não travado)", () => {
    // Contratado = 20 000 € sem IVA → 24 600 € com IVA; recebeu-se 25% a mais do
    // que isso. A percentagem compara com IVA dos dois lados.
    const d = data({
      quote: makeQuote({
        quotedPrice: 20000,
        priceBreakdown: undefined as never,
        payments: [pago({ kind: "pagamento", amount: 30750 })],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.contracted).toBe(24600);
    expect(m.paid).toBe(30750);
    expect(m.pctPaid).toBeCloseTo(1.25, 10);
  });
});

describe("computeEventMetrics — coerência sinal/saldo do registo de pagamentos", () => {
  // Contratado 20 000 € sem IVA → 24 600 € com IVA, faseado a 30/70 sobre o
  // valor COM IVA: sinal 7 380 €, saldo 17 220 €.
  const SINAL = 7380;
  const SALDO = 17220;

  it("uma linha POR receber não conta para o recebido nem para a percentagem", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: 20000,
        priceBreakdown: undefined as never,
        payments: [
          pago({ id: "p1", kind: "sinal", amount: SINAL }),
          pago({ id: "p2", kind: "saldo", amount: SALDO, paid: false }),
        ],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.paid).toBe(SINAL);
    expect(m.pctPaid).toBeCloseTo(0.3, 10);
  });

  it("sinal + saldo ambos recebidos fecham o contratado ao cêntimo", () => {
    const d = data({
      quote: makeQuote({
        quotedPrice: 20000,
        priceBreakdown: undefined as never,
        payments: [
          pago({ id: "p1", kind: "sinal", amount: SINAL }),
          pago({ id: "p2", kind: "saldo", amount: SALDO }),
        ],
      }),
    });
    const m = computeEventMetrics(d, TODAY);
    expect(m.paid).toBe(24600);
    expect(m.pctPaid).toBe(1);
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
      sumCostsNet = 0,
      sumNet = 0,
      sumMargin = 0;
    for (const q of quotes) {
      const m = computeEventMetrics({ quote: q, proposal: null, contract: null }, TODAY);
      sumContracted += m.contracted;
      sumCosts += m.supplierCosts;
      sumCostsNet += m.supplierCostsNet;
      sumNet += m.contractedNet;
      sumMargin += m.margin;
    }
    // 20 000 + 5 000 + 10 000 sem IVA = 35 000 € → 43 050 € com IVA, que é a base
    // em que os pagamentos e as facturas se comparam.
    expect(sumContracted).toBe(43050);
    expect(sumCosts).toBe(20000);
    expect(sumNet).toBe(35000);
    // A margem soma-se em LÍQUIDO dos dois lados: 35 000 − 16 260,17. O total
    // que se mostra no quadro de rentabilidade tem de continuar a ser a soma das
    // margens de cada evento, com o evento a perder lá pelo meio.
    expect(sumCostsNet).toBeCloseTo(16260.17, 2);
    expect(sumMargin).toBeCloseTo(18739.83, 2);
    expect(sumMargin).toBeCloseTo(sumNet - sumCostsNet, 10); // o fold mantém-se coerente
  });
});

describe("paidTotal — verdade ao cêntimo, sem falsos alarmes", () => {
  /**
   * Estes testes eram do `reconcileFinance`, que confrontava o registo de
   * pagamentos com o livro de facturas. O livro saiu com a facturação (ver a
   * nota em `dossier.ts`); o rigor ao cêntimo que eles protegiam continua a
   * valer — é o mesmo `round2` que impede um desvio de vírgula flutuante de
   * deixar um evento integralmente pago aquém do total contratado.
   */
  it("a deriva de vírgula flutuante é absorvida (round2)", () => {
    // 0.10 + 0.20 = 0.30000000000000004 em IEEE-754. Sem round2, um evento
    // contratado a 0,30 € nunca chegaria a «liquidado».
    const payments: Payment[] = [
      { id: "p1", kind: "sinal", amount: 0.1, date: "2026-02-01", paid: true },
      { id: "p2", kind: "pagamento", amount: 0.2, date: "2026-02-02", paid: true },
    ];
    expect(paidTotal(makeQuote({ payments }))).toBe(0.3);
  });

  it("só as linhas marcadas como recebidas contam", () => {
    const payments: Payment[] = [
      { id: "p1", kind: "sinal", amount: 6000, date: "2026-02-01", paid: true },
      { id: "p2", kind: "saldo", amount: 14000, date: "2026-05-01", paid: false }, // pendente
    ];
    expect(paidTotal(makeQuote({ payments }))).toBe(6000);
  });

  it("um evento sem pagamento nenhum vale 0, e não NaN", () => {
    expect(paidTotal(makeQuote())).toBe(0);
    expect(paidTotal(makeQuote({ payments: [] }))).toBe(0);
    expect(Number.isFinite(paidTotal(makeQuote()))).toBe(true);
  });

  it("valores negativos (estorno registado à mão) subtraem, e não são ignorados", () => {
    // Um estorno é dinheiro que SAIU. Ignorá-lo deixava o «Recebido» a afirmar
    // um valor que já não está na conta.
    const payments: Payment[] = [
      { id: "p1", kind: "pagamento", amount: 1000, date: "2026-02-01", paid: true },
      { id: "p2", kind: "pagamento", amount: -250, date: "2026-03-01", paid: true },
    ];
    expect(paidTotal(makeQuote({ payments }))).toBe(750);
  });
});

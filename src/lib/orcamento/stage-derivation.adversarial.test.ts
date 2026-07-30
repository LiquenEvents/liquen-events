import { describe, it, expect } from "vitest";
import { combinedPaidTotal, deriveStage, type DossierData, type EventStage } from "./dossier";
import type { Quote, Proposal, Payment } from "./types";

/**
 * ADVERSARIAL cobertura da máquina de estados `deriveStage`.
 *
 * Foco 1: coerência da fase quando os sinais chegam pelo PRÓPRIO `quote.status`
 * (não só por uma Proposal/Contract). O `deriveStage` já honra
 * `quote.status === "cotado"` e `"rejeitado"` como fallbacks sem objeto
 * proposta — mas faltava-lhe `"aceite"`, deixando um negócio ganho manualmente
 * (sem proposta nem contrato) a aparecer como `lead`, contradizendo o
 * `deriveRequestLifecycle` do stepper para o MESMO pedido.
 *
 * Foco 2: simetria das DUAS fontes de dinheiro no mesmo cálculo. O `sinalPago`
 * sempre aceitou um pagamento registado à mão (`quote.payments`) além do livro
 * de faturas; o `saldoPago` só olhava para o livro. Um evento já realizado e
 * todo pago pelo caminho rápido (registo à mão, o que o painel de Pagamentos
 * sugere e o que faz subir o "Recebido") nunca chegava a `concluido` — ficava
 * `em_producao` para sempre. O ecrã mentia sobre o estado do evento.
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

/**
 * Cenário-base das duas fontes: casamento ganho à mão (sem proposta), preço da
 * estimativa — `priceBreakdown.total` = 12 300 € COM IVA, a mesma base dos
 * pagamentos e das faturas. Faseamento 30/70 → sinal 3 690 €, saldo 8 610 €.
 */
const CONTRACTED = 12300;
const SINAL = 3690;
const SALDO = 8610;

/** Pagamento informal (linha do painel de Pagamentos) já marcado como recebido. */
function paid(kind: Payment["kind"], amount: number, id = `pay-${kind}`): Payment {
  return { id, kind, amount, date: "2026-06-20", paid: true };
}

/** Evento ganho que JÁ aconteceu (TODAY = 18/07/2026). */
function pastEvent(over: Partial<Quote> = {}): Quote {
  return makeQuote({ status: "aceite", date: "2026-07-01", ...over });
}

describe("deriveStage — saldo pago: livro de faturas E registo à mão", () => {
  it("pago só pelo LIVRO: fatura de saldo paga → concluido", () => {
    const d = data({
      quote: pastEvent(),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0002",
          kind: "saldo",
          amount: SALDO,
          status: "paga",
          issuedAt: "2026-06-10",
        },
      ],
    });
    expect(deriveStage(d, TODAY)).toBe<EventStage>("concluido");
  });

  it("pago só À MÃO: sinal + saldo registados e marcados pagos → concluido", () => {
    // O DEFEITO. Registar o dinheiro à mão é o caminho rápido (e o que o painel
    // de Pagamentos sugere: "Já pago" vem ligado). Sem faturas no livro, o
    // casamento já realizado e integralmente pago ficava eternamente
    // `em_producao` e acumulava no quadro, ano após ano.
    const d = data({
      quote: pastEvent({ payments: [paid("sinal", SINAL), paid("saldo", SALDO)] }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("pago só À MÃO sem linha rotulada 'saldo': entradas avulsas cobrem o total → concluido", () => {
    // Nem toda a gente usa o rótulo "Saldo final": duas transferências avulsas
    // que cobrem o contratado valem tanto como uma fatura de saldo paga.
    const d = data({
      quote: pastEvent({
        payments: [
          paid("pagamento", 6150, "pay-1"),
          { id: "pay-2", kind: "pagamento", amount: 6150, date: "2026-07-02", paid: true },
        ],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("pago pelos DOIS caminhos (sinal no livro, saldo à mão) → concluido", () => {
    const d = data({
      quote: pastEvent({ payments: [paid("saldo", SALDO)] }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: SINAL,
          status: "paga",
          issuedAt: "2026-03-01",
        },
      ],
    });
    expect(deriveStage(d, TODAY)).toBe("concluido");
  });

  it("o MESMO dinheiro nos dois sítios NÃO conta a dobrar", () => {
    // Metade do contrato (6 150 € de 12 300 €) registada à mão E faturada no
    // livro — é o fluxo normal: regista-se o pagamento e emite-se o recibo a
    // partir dele. Somar as duas fontes daria 12 300 € e declararia concluído um
    // casamento com metade por receber. O mesmo sinal, visto de dois sítios, só
    // pode valer 6 150 €.
    const d = data({
      quote: pastEvent({ payments: [paid("sinal", 6150)] }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: 6150,
          status: "paga",
          issuedAt: "2026-03-01",
        },
      ],
    });
    expect(combinedPaidTotal(d)).toBe(6150); // não 12 300
    expect(deriveStage(d, TODAY)).toBe("em_producao"); // metade por receber
  });

  it("pago a MEIO (só o sinal, à mão) → fica em_producao, não concluido", () => {
    const d = data({ quote: pastEvent({ payments: [paid("sinal", SINAL)] }) });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("saldo registado mas NÃO marcado como pago → não concluido", () => {
    const d = data({
      quote: pastEvent({
        payments: [
          paid("sinal", SINAL),
          { id: "pay-saldo", kind: "saldo", amount: SALDO, date: "2026-07-05", paid: false },
        ],
      }),
    });
    expect(deriveStage(d, TODAY)).toBe("em_producao");
  });

  it("saldo 'pago' de valor ZERO não conclui nada (mesma guarda do sinal)", () => {
    const d = data({ quote: pastEvent({ payments: [paid("saldo", 0)] }) });
    expect(deriveStage(d, TODAY)).toBe("aceite");
  });

  it("EVENTO FUTURO todo pago à mão NUNCA aparece como concluido", () => {
    // A guarda que importa: dinheiro recebido adiantado não faz o casamento
    // acontecer. Data distante → em_producao; dentro da semana → semana_evento.
    const payments = [paid("sinal", SINAL), paid("saldo", SALDO)];
    const distante = data({
      quote: makeQuote({ status: "aceite", date: "2026-09-12", payments }),
    });
    expect(deriveStage(distante, TODAY)).toBe("em_producao");

    const estaSemana = data({
      quote: makeQuote({ status: "aceite", date: "2026-07-22", payments }),
    });
    expect(deriveStage(estaSemana, TODAY)).toBe("semana_evento");

    // Tarde do próprio dia do evento: ainda é "hoje", ainda não passou.
    const hoje = data({
      quote: makeQuote({ status: "aceite", date: "2026-07-18", payments }),
    });
    expect(deriveStage(hoje, new Date("2026-07-18T15:00:00Z"))).toBe("semana_evento");
  });

  it("perdido continua a ganhar a tudo, mesmo com o saldo pago à mão", () => {
    const d = data({
      quote: pastEvent({ status: "rejeitado", payments: [paid("saldo", SALDO)] }),
    });
    expect(deriveStage(d, TODAY)).toBe("perdido");
  });
});

describe("combinedPaidTotal — duas vistas do mesmo dinheiro, nunca duas carteiras", () => {
  it("espelho perfeito (livro = registo à mão) conta uma só vez", () => {
    const d = data({
      quote: makeQuote({ payments: [paid("sinal", SINAL), paid("saldo", SALDO)] }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: SINAL,
          status: "paga",
          issuedAt: "2026-03-01",
        },
        {
          id: "i2",
          number: "FT 2026/0002",
          kind: "saldo",
          amount: SALDO,
          status: "paga",
          issuedAt: "2026-06-10",
        },
      ],
    });
    expect(combinedPaidTotal(d)).toBe(CONTRACTED);
  });

  it("cada espécie pela sua fonte (sinal no livro, saldo à mão) soma as duas", () => {
    const d = data({
      quote: makeQuote({ payments: [paid("saldo", SALDO)] }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: SINAL,
          status: "paga",
          issuedAt: "2026-03-01",
        },
      ],
    });
    expect(combinedPaidTotal(d)).toBe(CONTRACTED);
  });

  it("registo parcial de um dos lados → prevalece o lado mais completo", () => {
    // Registaram-se 1 000 € à mão do sinal de 3 690 € que a fatura já dá por
    // liquidado. Vale o livro (3 690), não a soma (4 690) nem o registo (1 000).
    const d = data({
      quote: makeQuote({ payments: [paid("sinal", 1000)] }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: SINAL,
          status: "paga",
          issuedAt: "2026-03-01",
        },
      ],
    });
    expect(combinedPaidTotal(d)).toBe(SINAL);
  });

  it("só conta o que está pago: emitida/anulada e linhas por pagar valem 0", () => {
    const d = data({
      quote: makeQuote({
        payments: [{ id: "p1", kind: "saldo", amount: SALDO, date: "2026-07-05", paid: false }],
      }),
      invoices: [
        {
          id: "i1",
          number: "FT 2026/0001",
          kind: "sinal",
          amount: SINAL,
          status: "emitida",
          issuedAt: "2026-03-01",
        },
        {
          id: "i2",
          number: "FT 2026/0002",
          kind: "saldo",
          amount: SALDO,
          status: "anulada",
          issuedAt: "2026-06-10",
        },
      ],
    });
    expect(combinedPaidTotal(d)).toBe(0);
  });

  it("soma aos cêntimos, sem lixo de vírgula flutuante", () => {
    // 0.10 + 0.20 = 0.30000000000000004 em IEEE-754. `reconcileFinance` já
    // arredonda aos cêntimos antes de comparar; esta soma tem de fazer o mesmo.
    const d = data({
      quote: makeQuote({ payments: [paid("pagamento", 0.1, "p1"), paid("saldo", 0.2, "p2")] }),
    });
    expect(combinedPaidTotal(d)).toBe(0.3);
  });

  it("um desvio de cêntimo não deixa um evento INTEGRALMENTE pago preso em produção", () => {
    // Contrato pequeno de propósito: só nesta ordem de grandeza é que o desvio
    // do IEEE-754 é maior que o passo entre dois valores representáveis
    // (6.10 + 1.95 + 1.95 = 9.999999999999998, abaixo de 10). O arredondamento
    // aos cêntimos absorve-o; sem ele o evento ficava eternamente `em_producao`
    // por dois zeptocêntimos.
    const centavos = pastEvent({
      priceBreakdown: { ...makeQuote().priceBreakdown!, subtotal: 8.13, iva: 1.87, total: 10 },
      payments: [
        paid("pagamento", 6.1, "p1"),
        paid("pagamento", 1.95, "p2"),
        { id: "p3", kind: "pagamento", amount: 1.95, date: "2026-06-22", paid: true },
      ],
    });
    expect(6.1 + 1.95 + 1.95).toBeLessThan(10); // o desvio existe mesmo
    expect(combinedPaidTotal(data({ quote: centavos }))).toBe(10);
    expect(deriveStage(data({ quote: centavos }), TODAY)).toBe("concluido");
  });
});

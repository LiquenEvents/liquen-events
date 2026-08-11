import { describe, it, expect } from "vitest";
import { round2, splitSinal, saldoAPartirDoSinal, SINAL_POR_OMISSAO } from "./money";
import {
  resolveProposalMoney,
  depositPercentOf,
  totalAmountParaBase,
  DEFAULT_VAT_RATE,
  type ProposalDoc,
  type VatMode,
} from "./proposal-doc";
import { somaDosItens, desalinhamento, sinalESaldo, somaDosExtrasSemIva } from "./proposal-budget";
import { totaisDasVersoes } from "./orcamento/versoes-da-proposta";
import { contractedAmounts, computeEventMetrics, type DossierData } from "./orcamento/dossier";
import { calculatePrice } from "./orcamento/pricing";
import type { Quote, Proposal } from "./orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS VERDADES DO DINHEIRO — VARRIDAS, NÃO EXEMPLIFICADAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os testes que já existiam escolhiam três números bonitos: 3.000 € a 23%,
 * 3.690 € com IVA incluído, 10.000 €. Todos redondos, todos à taxa normal,
 * todos com o sinal nos 30%. É exactamente o conjunto de casos em que uma
 * conta errada de arredondamento NÃO aparece — porque com números redondos
 * não há cêntimo nenhum para se perder.
 *
 * Aqui não há exemplos escolhidos: há combinações GERADAS. Cada invariante
 * corre sobre dezenas ou centenas de pares (base, taxa, modo, percentagem de
 * sinal, extras), incluindo bases com cêntimos ímpares, taxas reduzidas e
 * percentagens de sinal que ninguém usa mas que o campo aceita.
 *
 * A regra deste ficheiro: cada `it` afirma UMA verdade que tem de valer
 * SEMPRE, e a mensagem de falha diz que combinação a partiu — porque um
 * "expected 700.01 to be 700" sobre um varrimento de 400 casos não serve de
 * nada a quem o vai corrigir.
 *
 * Um cêntimo a mais ou a menos aqui é uma factura errada emitida a um cliente
 * real. Não há tolerâncias `toBeCloseTo` neste ficheiro de propósito: o que se
 * compara são cêntimos inteiros, e o que fecha ao cêntimo tem de fechar mesmo.
 */

// ── Os geradores ──────────────────────────────────────────────────────────
// As taxas que a Líquen pode praticar (a normal, as reduzidas) mais o zero,
// que é o caso das isenções e o divisor mais perigoso de todos.
const TAXAS = [0, 0.06, 0.13, 0.23];
const MODOS: VatMode[] = ["acrescer", "incluido"];

/**
 * Bases com cêntimos de propósito.
 *
 * Um casamento fecha em "8.100 €" e a conta sai certa em qualquer implementação.
 * Sai errada em 8.100,01 €, em 3.333,33 € e em 1.000,005 € — e é para esses que
 * este varrimento existe. Os valores redondos ficam na lista na mesma: são o
 * caso normal e também têm de continuar certos.
 */
const BASES = [
  0.01, 1, 1.01, 9.99, 99.99, 100, 333.33, 999.995, 1000, 1000.01, 1234.56, 1550, 2999.99, 3000,
  6875, 8100, 8100.01, 9999.99, 10000, 12345.67, 12500, 33333.33, 99999.99,
];

/** As percentagens de sinal que o campo aceita — todas, não só os 30%. */
const PERCENTAGENS = Array.from({ length: 99 }, (_, i) => i + 1);

/** O documento mínimo que `resolveProposalMoney` sabe ler. */
function docDeTotal(
  amount: number,
  mode: VatMode,
  vatRate: number,
): Pick<ProposalDoc, "totalAmount" | "totalVatMode" | "vatRate"> {
  return { totalAmount: amount, totalVatMode: mode, vatRate };
}

/**
 * O `totalAmount` que corresponde a uma dada BASE, no modo em vigor.
 *
 * É a conta que o estúdio faz ao gravar o campo «Preço final (sem IVA)». Aqui
 * chama-se a função PARTILHADA de propósito: se o teste tivesse a sua própria
 * cópia da conta, estaria a verificar-se a si mesmo — e a ida e volta que
 * interessa é a que o estúdio faz, não a que o teste inventa.
 */
const amountParaBase = totalAmountParaBase;

// ══════════════════════════════════════════════════════════════════════════
// 1. gross === base + vat, sempre, aos cêntimos
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: o bruto é sempre a base mais o IVA", () => {
  it("fecha ao cêntimo em todas as combinações de valor, taxa e modo", () => {
    const falhas: string[] = [];
    for (const amount of BASES) {
      for (const taxa of TAXAS) {
        for (const modo of MODOS) {
          const m = resolveProposalMoney(docDeTotal(amount, modo, taxa));
          if (round2(m.base + m.vat) !== m.gross) {
            falhas.push(
              `${amount} € @ ${taxa * 100}% (${modo}): ${m.base} + ${m.vat} = ` +
                `${round2(m.base + m.vat)} ≠ ${m.gross}`,
            );
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("o IVA nunca é negativo nem maior do que o bruto", () => {
    const falhas: string[] = [];
    for (const amount of BASES) {
      for (const taxa of TAXAS) {
        for (const modo of MODOS) {
          const m = resolveProposalMoney(docDeTotal(amount, modo, taxa));
          if (m.vat < 0 || m.vat > m.gross || m.base < 0) {
            falhas.push(`${amount} € @ ${taxa * 100}% (${modo}): base ${m.base}, IVA ${m.vat}`);
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 2. Ida e volta: base → bruto → base devolve o mesmo valor
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: converter base → bruto → base devolve a mesma base", () => {
  /**
   * É esta a ida e volta que o estúdio faz a cada tecla: ela escreve a base no
   * campo «Preço final (sem IVA)», o documento guarda o derivado (`totalAmount`),
   * e o campo volta a ser preenchido com a base lida de volta. Se a volta não
   * devolver o mesmo número, o campo muda sozinho enquanto ela escreve — e o
   * pedido e a proposta separam-se por um cêntimo sem ninguém tocar em nada.
   */
  it("em qualquer modo e a qualquer taxa", () => {
    const falhas: string[] = [];
    for (const base of BASES) {
      for (const taxa of TAXAS) {
        for (const modo of MODOS) {
          const amount = amountParaBase(base, modo, taxa);
          const volta = resolveProposalMoney(docDeTotal(amount, modo, taxa)).base;
          if (volta !== round2(base)) {
            falhas.push(`${base} € @ ${taxa * 100}% (${modo}): ida ${amount} → volta ${volta}`);
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 3. sinal + saldo === bruto, exactamente, para qualquer percentagem
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: o sinal e o saldo fecham o total", () => {
  it("para todas as percentagens de 1 a 99 e todos os totais", () => {
    const falhas: string[] = [];
    for (const total of BASES) {
      for (const pct of PERCENTAGENS) {
        const { sinal, saldo } = splitSinal(total, pct);
        if (round2(sinal + saldo) !== round2(total)) {
          falhas.push(`${total} € a ${pct}%: ${sinal} + ${saldo} = ${round2(sinal + saldo)}`);
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("`sinalESaldo` do orçamento diz exactamente o mesmo que `splitSinal`", () => {
    // São duas funções com a mesma conta escrita duas vezes. Enquanto forem
    // duas, podem divergir — e a que o estúdio mostra deixa de ser a que a
    // factura emite.
    const falhas: string[] = [];
    for (const total of BASES) {
      for (const pct of PERCENTAGENS) {
        const a = splitSinal(total, pct);
        const b = sinalESaldo(total, pct);
        if (a.sinal !== b.sinal || a.saldo !== b.saldo) {
          falhas.push(
            `${total} € a ${pct}%: money ${a.sinal}/${a.saldo} ≠ orçamento ${b.sinal}/${b.saldo}`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("nenhuma das parcelas é negativa, nem maior do que o total", () => {
    const falhas: string[] = [];
    for (const total of BASES) {
      for (const pct of PERCENTAGENS) {
        const { sinal, saldo } = splitSinal(total, pct);
        if (sinal < 0 || saldo < 0 || sinal > total || saldo > total) {
          falhas.push(`${total} € a ${pct}%: sinal ${sinal}, saldo ${saldo}`);
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 4. O total facturado de um aceite é o total da proposta aceite
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: as facturas de um aceite somam o total da proposta", () => {
  /**
   * O percurso real: a proposta é aceite, `/api/proposta` emite o sinal com
   * `splitSinal(proposal.total, depositPercentOf(doc))`, e mais tarde
   * `/api/faturas/[id]` emite o saldo. Quando a proposta ainda existe e bate
   * certo, o saldo é `total − sinal`; sem ela, é derivado do sinal facturado.
   * As duas parcelas têm de somar o total nos DOIS caminhos.
   */
  it("pelo caminho normal (a proposta existe e o saldo é o resto)", () => {
    const falhas: string[] = [];
    for (const base of BASES) {
      for (const taxa of TAXAS) {
        for (const modo of MODOS) {
          for (const pct of [1, 15, 30, 40, 50, 70, 99]) {
            const doc = {
              ...docDeTotal(amountParaBase(base, modo, taxa), modo, taxa),
              depositPercent: pct,
            } as unknown as ProposalDoc;
            const money = resolveProposalMoney(doc);
            const { sinal, saldo } = splitSinal(money.gross, depositPercentOf(doc));
            if (round2(sinal + saldo) !== money.gross) {
              falhas.push(
                `${base} € @ ${taxa * 100}% (${modo}) sinal ${pct}%: ` +
                  `${sinal} + ${saldo} ≠ ${money.gross}`,
              );
            }
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("pelo caminho derivado do sinal já facturado: as duas parcelas fecham um total coerente", () => {
    /**
     * `saldoAPartirDoSinal` é a rede para quando a proposta desapareceu ou foi
     * revista: reconstrói o saldo só a partir do sinal que já está no livro.
     * Não consegue recuperar o total exacto — o sinal já foi arredondado — mas
     * NUNCA pode deixar um cêntimo a boiar entre as duas parcelas: o que ele
     * devolve tem de ser exactamente o resto do total que reconstruiu.
     */
    const falhas: string[] = [];
    for (const total of BASES) {
      for (const pct of PERCENTAGENS) {
        const { sinal } = splitSinal(total, pct);
        const saldo = saldoAPartirDoSinal(sinal, pct);
        const reconstruido = round2((sinal * 100) / pct);
        if (Math.round((sinal + saldo) * 100) !== Math.round(reconstruido * 100)) {
          falhas.push(
            `${total} € a ${pct}%: ${sinal} + ${saldo} ≠ total reconstruído ${reconstruido}`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("o desvio do total reconstruído obedece à lei da amplificação, e nunca a excede", () => {
    /**
     * ── A LEI, ESCRITA PARA SE PODER OLHAR PARA ELA ─────────────────────────
     * O sinal já foi arredondado quando foi facturado: traz até meio cêntimo
     * de erro. Reconstruir o total a partir dele é dividir por `pct/100`, o
     * que MULTIPLICA esse meio cêntimo por `100/pct`.
     *
     *   • aos 30% da casa   → factor 3,3  → até ~2 cêntimos
     *   • aos 20%           → factor 5    → até ~3 cêntimos
     *   • a 1%              → factor 100  → até ~50 CÊNTIMOS
     *
     * Foi por isso que o `sinal / 3 × 7` sobreviveu anos sem ninguém notar, e
     * é por isso que deixou de ser seguro no dia em que a percentagem passou a
     * ser editável. Este teste não «tolera» o desvio: fixa-o à lei, para que
     * qualquer agravamento apareça como falha.
     *
     * O caminho certo continua a ser a proposta (`splitSinal`, exacto), que é
     * o que a rota tenta primeiro de propósito.
     */
    const falhas: string[] = [];
    for (const total of BASES) {
      for (const pct of PERCENTAGENS) {
        const { sinal } = splitSinal(total, pct);
        const saldo = saldoAPartirDoSinal(sinal, pct);
        const desvioEmCentimos = Math.abs(
          Math.round((sinal + saldo) * 100) - Math.round(round2(total) * 100),
        );
        const limite = Math.ceil((0.5 * 100) / pct) + 1;
        if (desvioEmCentimos > limite) {
          falhas.push(
            `${total} € a ${pct}%: ${sinal} + ${saldo} desvia ${desvioEmCentimos} cênt. ` +
              `(a lei admite ${limite})`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("a percentagem por omissão é a mesma em todo o lado", () => {
    expect(depositPercentOf(undefined)).toBe(SINAL_POR_OMISSAO);
    expect(depositPercentOf({} as ProposalDoc)).toBe(SINAL_POR_OMISSAO);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 5. A soma das linhas mais os adicionais bate com o total, na MESMA base
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: as linhas e os adicionais somam o total, na mesma base", () => {
  /**
   * Os preços por linha são SEMPRE líquidos (é um campo numérico, sem IVA
   * nenhum escrito ao lado). O `totalAmount`, esse, só é líquido em modo
   * "acrescer". Comparar os dois sem converter é comparar euros com euros
   * diferentes — e foi assim que o painel de progresso dizia «o total não bate
   * com a soma das linhas» em TODAS as propostas com IVA incluído.
   */
  it("sem adicionais: a soma das linhas é a base, nos dois modos", () => {
    const falhas: string[] = [];
    for (const taxa of TAXAS) {
      for (const modo of MODOS) {
        // Três linhas que somam exactamente a base.
        const linhas = [900.4, 1200.35, 650.25];
        const base = round2(linhas.reduce((a, b) => a + b, 0));
        const doc = {
          budgetItems: ["a", "b", "c"],
          budgetAmounts: linhas,
          budgetExtras: [],
          ...docDeTotal(amountParaBase(base, modo, taxa), modo, taxa),
        } as unknown as ProposalDoc;
        const desvio = desalinhamento(doc, resolveProposalMoney(doc).base);
        if (desvio !== null) {
          falhas.push(
            `@ ${taxa * 100}% (${modo}): soma ${desvio.soma} vs base ${desvio.total} ` +
              `(diferença ${desvio.diferenca})`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("com um adicional calado, que segue o modo do documento", () => {
    /**
     * «Deslocação da equipa — 1.550,00 €», sem dizer nada sobre IVA. Numa
     * proposta que se lê COM IVA, esses 1.550 são o que o casal paga: valem
     * 1.260,16 de base a 23%. Somar os 1.550 crus à base é prometer uma coisa
     * na linha e cobrar outra no total.
     */
    const falhas: string[] = [];
    for (const taxa of TAXAS) {
      for (const modo of MODOS) {
        const linhas = [900, 1200];
        const extraSemIva = somaDosExtrasSemIva(
          [{ label: "Deslocação", valueText: "1.550,00 €" }],
          {
            mode: modo,
            vatRate: taxa,
          },
        );
        const base = round2(linhas.reduce((a, b) => a + b, 0) + extraSemIva);
        const doc = {
          budgetItems: ["a", "b"],
          budgetAmounts: linhas,
          budgetExtras: [{ label: "Deslocação", valueText: "1.550,00 €" }],
          ...docDeTotal(amountParaBase(base, modo, taxa), modo, taxa),
        } as unknown as ProposalDoc;
        const desvio = desalinhamento(doc, resolveProposalMoney(doc).base);
        if (desvio !== null) {
          falhas.push(
            `@ ${taxa * 100}% (${modo}): soma ${desvio.soma} vs base ${desvio.total} ` +
              `(diferença ${desvio.diferenca})`,
          );
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("um adicional que declara «+ IVA» vale o mesmo em qualquer modo", () => {
    // O que a linha diz ganha ao modo do documento — é a intenção de quem a
    // escreveu, e está impressa no PDF ao lado do valor.
    for (const taxa of TAXAS) {
      const linha = [{ label: "Coordenação", valueText: "895,00 € + IVA" }];
      expect(somaDosExtrasSemIva(linha, { mode: "acrescer", vatRate: taxa })).toBe(895);
      expect(somaDosExtrasSemIva(linha, { mode: "incluido", vatRate: taxa })).toBe(895);
    }
  });

  it("`somaDosItens` e `desalinhamento` respondem sobre a mesma base", () => {
    const falhas: string[] = [];
    for (const taxa of TAXAS) {
      for (const modo of MODOS) {
        const doc = {
          budgetItems: ["a"],
          budgetAmounts: [1000],
          budgetExtras: [{ label: "Deslocação", valueText: "1.550,00 €" }],
          ...docDeTotal(amountParaBase(2000, modo, taxa), modo, taxa),
        } as unknown as ProposalDoc;
        const soma = somaDosItens(doc);
        const base = resolveProposalMoney(doc).base;
        const desvio = desalinhamento(doc, base);
        const esperado = round2(base - (soma ?? 0));
        const dito = desvio === null ? 0 : desvio.diferenca;
        if (Math.abs(esperado) > 0.01 && dito !== esperado) {
          falhas.push(`@ ${taxa * 100}% (${modo}): soma ${soma}, base ${base}, diz ${dito}`);
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 6. As duas versões (base / com extras) somam-se na mesma base
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: a versão base mais os extras dá a proposta inteira", () => {
  /**
   * O caso que custa dinheiro a sério: uma proposta de 10.000 € de base a 23%
   * com IVA incluído guarda `totalAmount = 12.300`. Os preços por linha são
   * líquidos. Subtrair 2.000 € de linha extra a 12.300 dá 10.300 € — e o PDF
   * imprime «Sem os extras assinalados: 10.300,00 €» onde o correcto são
   * 9.840 € (8.000 de base × 1,23). São 460 € oferecidos ao casal, impressos.
   */
  it("fecha ao cêntimo, sem IVA e com IVA, em todos os modos e taxas", () => {
    const falhas: string[] = [];
    for (const taxa of TAXAS) {
      for (const modo of MODOS) {
        for (const [normal, extra] of [
          [8000, 2000],
          [900.4, 1200.35],
          [1, 0.01],
          [33333.33, 6666.67],
        ]) {
          const base = round2(normal + extra);
          const doc = {
            budgetItems: ["normal", "extra"],
            budgetAmounts: [normal, extra],
            budgetOpcional: [false, true],
            budgetExtras: [],
            ...docDeTotal(amountParaBase(base, modo, taxa), modo, taxa),
          } as unknown as ProposalDoc;
          const v = totaisDasVersoes(doc);
          if (!v) {
            falhas.push(`@ ${taxa * 100}% (${modo}) ${normal}+${extra}: sem versões`);
            continue;
          }
          if (round2(v.base + v.extras) !== v.comExtras) {
            falhas.push(
              `@ ${taxa * 100}% (${modo}) ${normal}+${extra} SEM IVA: ` +
                `${v.base} + ${v.extras} ≠ ${v.comExtras}`,
            );
          }
          if (round2(v.bruto.base + v.bruto.extras) !== v.bruto.comExtras) {
            falhas.push(
              `@ ${taxa * 100}% (${modo}) ${normal}+${extra} COM IVA: ` +
                `${v.bruto.base} + ${v.bruto.extras} ≠ ${v.bruto.comExtras}`,
            );
          }
          // E o número que a proposta inteira vale tem de ser o mesmo que o
          // resto do sistema factura.
          const m = resolveProposalMoney(doc);
          if (v.comExtras !== m.base || v.bruto.comExtras !== m.gross) {
            falhas.push(
              `@ ${taxa * 100}% (${modo}) ${normal}+${extra}: versões dizem ` +
                `${v.comExtras}/${v.bruto.comExtras}, a proposta vale ${m.base}/${m.gross}`,
            );
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("o número a MOSTRAR está na mesma unidade do total impresso ao lado", () => {
    // Em "acrescer" o PDF escreve «9.840,00 € + IVA» (líquido); em "incluído"
    // escreve «12.103,20 €» (bruto). Mostrar o líquido debaixo de um total
    // bruto é imprimir dois números que não se comparam.
    for (const taxa of TAXAS) {
      for (const modo of MODOS) {
        const doc = {
          budgetItems: ["normal", "extra"],
          budgetAmounts: [8000, 2000],
          budgetOpcional: [false, true],
          budgetExtras: [],
          ...docDeTotal(amountParaBase(10000, modo, taxa), modo, taxa),
        } as unknown as ProposalDoc;
        const v = totaisDasVersoes(doc)!;
        expect(v.comoOTotal.base).toBe(modo === "acrescer" ? v.base : v.bruto.base);
        expect(v.comoOTotal.comExtras).toBe(doc.totalAmount);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 7. O valor contratado decompõe-se sem perder cêntimos
// ══════════════════════════════════════════════════════════════════════════
function quoteBase(over: Partial<Quote> = {}): Quote {
  return {
    id: "q",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "aceite",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2026-09-12",
    endDate: "",
    location: "Évora",
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
    name: "Maria & Zé",
    email: "m@example.com",
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
  } as Quote;
}

function propostaDe(base: number, taxa: number): Proposal {
  const m = resolveProposalMoney(docDeTotal(base, "acrescer", taxa));
  return {
    id: "p",
    quoteId: "q",
    clientName: "Maria & Zé",
    clientEmail: "m@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: m.vatRate,
    subtotal: m.base,
    vat: m.vat,
    total: m.gross,
    status: "aceite",
    createdAt: "2026-01-01T10:00:00Z",
  } as Proposal;
}

describe("invariante: o valor contratado decompõe-se sem perder cêntimos", () => {
  it("net + IVA === bruto, venha o total da proposta, do preço cotado ou da estimativa", () => {
    const falhas: string[] = [];
    for (const base of BASES) {
      for (const taxa of TAXAS) {
        const daProposta = contractedAmounts(quoteBase(), propostaDe(base, taxa));
        if (round2(daProposta.net + daProposta.iva) !== daProposta.gross) {
          falhas.push(
            `proposta ${base} € @ ${taxa * 100}%: ${daProposta.net} + ${daProposta.iva} ≠ ${daProposta.gross}`,
          );
        }
        const doCotado = contractedAmounts(quoteBase({ quotedPrice: base }));
        if (round2(doCotado.net + doCotado.iva) !== doCotado.gross) {
          falhas.push(`cotado ${base} €: ${doCotado.net} + ${doCotado.iva} ≠ ${doCotado.gross}`);
        }
      }
    }
    expect(falhas).toEqual([]);
  });

  it("uma proposta antiga sem `subtotal` gravado não fica com o líquido a zero", () => {
    /**
     * As linhas de `proposals` anteriores à coluna `subtotal` lêem-se como 0
     * (ver `proposals-store.fromRow`). Com o líquido a zero, o dossier dizia
     * que um casamento de 12.300 € tinha 0 € de valor sem IVA e 12.300 € de
     * IVA — e a margem do evento, que compara líquidos, saía a menos o preço
     * todo.
     */
    const antiga = { ...propostaDe(10000, 0.23), subtotal: 0, vat: 0 } as Proposal;
    const a = contractedAmounts(quoteBase(), antiga);
    expect(a.gross).toBe(12300);
    expect(a.net).toBe(10000);
    expect(a.iva).toBe(2300);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 8. A margem de um evento compara líquido com líquido
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: a margem compara receita líquida com custos líquidos", () => {
  /**
   * O IVA não é receita nem é custo: entra e sai. Uma margem calculada sobre
   * brutos é a margem verdadeira multiplicada por 1,23 — e o que ela lê no
   * quadro de rentabilidade é um lucro que não existe.
   */
  it("a margem é receita sem IVA menos custos sem IVA", () => {
    const falhas: string[] = [];
    for (const base of [5000, 8100, 12345.67, 20000]) {
      for (const taxa of TAXAS) {
        for (const custoBruto of [0, 1000, 4999.99, base]) {
          const d: DossierData = {
            quote: quoteBase({
              eventSuppliers: [
                {
                  id: "s",
                  name: "Florista",
                  category: "Floristas",
                  estimatedCost: custoBruto,
                  status: "confirmado",
                },
              ],
            }),
            proposal: propostaDe(base, taxa),
            contract: null,
            invoices: [],
          };
          const m = computeEventMetrics(d);
          const esperada = round2(m.contractedNet - m.supplierCostsNet);
          if (m.margin !== esperada) {
            falhas.push(
              `${base} € @ ${taxa * 100}% com ${custoBruto} € de custo: ` +
                `margem ${m.margin} ≠ ${m.contractedNet} − ${m.supplierCostsNet} = ${esperada}`,
            );
          }
          // Um custo igual à receita é margem zero — em euros e em pontos
          // percentuais. Se o bruto se misturasse com o líquido, não seria.
          if (custoBruto === round2(base * (1 + taxa)) && m.margin !== 0) {
            falhas.push(`custo igual à receita e margem ${m.margin} ≠ 0`);
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 9. O motor de preços público: o que se mostra soma
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: o orçamento público soma o que mostra", () => {
  it("subtotal + IVA === total, para todas as combinações do formulário", () => {
    const falhas: string[] = [];
    const pacotes = ["essencial", "completo", "premium", "personalizado"];
    const locais = ["lisboa", "porto", "grande_cidade", "pequena_cidade", "internacional"];
    for (const packageTier of pacotes) {
      for (const locationType of locais) {
        for (const guests of [20, 50, 80, 120, 250]) {
          for (const urgency of ["standard", "rush", "urgente"]) {
            const p = calculatePrice({
              category: "particulares",
              eventType: "casamentos",
              guests,
              packageTier,
              locationType,
              urgency,
              date: "2026-09-12",
              addons: [],
            } as never);
            if (p.subtotal + p.iva !== p.total) {
              falhas.push(
                `${packageTier}/${locationType}/${guests}/${urgency}: ` +
                  `${p.subtotal} + ${p.iva} ≠ ${p.total}`,
              );
            }
            if (p.iva !== Math.round(p.subtotal * 0.23)) {
              falhas.push(
                `${packageTier}/${locationType}/${guests}/${urgency}: IVA ${p.iva} ` +
                  `não é 23% do subtotal mostrado (${Math.round(p.subtotal * 0.23)})`,
              );
            }
          }
        }
      }
    }
    expect(falhas).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// 10. O arredondamento acontece no FIM, não a meio
// ══════════════════════════════════════════════════════════════════════════
describe("invariante: arredonda-se uma vez, no fim", () => {
  it("`round2` arredonda os meios cêntimos para cima, e não para baixo", () => {
    /**
     * `Math.round(1.005 * 100) / 100` dá 1,00 e não 1,01, porque 1.005 não
     * existe em vírgula flutuante — o que lá está é 1.00499999999999989. Num
     * IVA isto é um cêntimo a menos numa factura, e uma factura em que as
     * parcelas não fecham é uma conversa com o contabilista.
     */
    const falhas: string[] = [];
    for (const n of [1.005, 2.675, 8.615, 1.045, 1.055, 1.065, 1.075, 1.085, 1.095, 1234.565]) {
      const esperado = Math.round(Number(`${n}e2`)) / 100;
      if (round2(n) !== esperado) falhas.push(`round2(${n}) = ${round2(n)}, esperado ${esperado}`);
    }
    expect(falhas).toEqual([]);
  });

  it("a taxa por omissão é uma só, em todos os módulos do dinheiro", () => {
    expect(DEFAULT_VAT_RATE).toBe(0.23);
    // Um adicional sem contexto nenhum vale o que diz, à taxa da casa.
    expect(
      somaDosExtrasSemIva([{ label: "X", valueText: "1.230,00 €" }], { mode: "incluido" }),
    ).toBe(1000);
  });
});

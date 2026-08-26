import { describe, it, expect } from "vitest";
import {
  valoresSuspeitos,
  contasQueNaoFecham,
  type EntradaParaAuditoria,
} from "./valores-inflacionados";
import type { ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENCONTRAR, MESES DEPOIS, AS PROPOSTAS QUE CRESCERAM SOZINHAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso dela, com números reais: serviços a somar 3.000 €, uma deslocação de
 * 140 €, e o total a subir de visita em visita — 3.140, 3.280, 3.420.
 *
 * O que aqui interessa provar são duas coisas, e a segunda vale mais do que a
 * primeira:
 *
 *  1. **apanha as inchadas.** A diferença entre o total escrito e a soma das
 *     linhas é um múltiplo exacto dos adicionais, e diz quantas somas lá estão;
 *  2. **e não apanha mais nada.** Um desconto, um arredondamento, um acerto
 *     combinado ao telefone — tudo isso faz o total afastar-se da soma das
 *     linhas, e nada disso é uma avaria. Uma lista que gritasse por metade da
 *     base era uma lista que ela não voltava a abrir; e, pior, era uma lista a
 *     partir da qual se podia «corrigir» dinheiro que estava certo.
 */

/**
 * Um documento com serviços a somar `servicos`, uma deslocação de `extras`, e
 * o total escrito em `escrito`. É a forma mínima que a auditoria lê.
 */
function docDe({
  servicos,
  extras,
  escrito,
  somam = true,
  marcaAusente = false,
}: {
  servicos: number;
  extras: number;
  escrito: number;
  somam?: boolean;
  /**
   * A marca `budgetExtrasSomam` NÃO está escrita no documento — que é a avaria
   * dos dois casos reais que a auditoria encontrou. Ver `contasQueNaoFecham`.
   *
   * É uma opção à parte e não um `somam: undefined` por uma razão de
   * JavaScript que já me apanhou aqui: um valor por omissão num parâmetro
   * destruturado entra em vigor precisamente quando o que se passa é
   * `undefined`. `somam: undefined` chegava cá dentro como `true`.
   */
  marcaAusente?: boolean;
}): ProposalDoc {
  return {
    // As linhas são texto; os preços vivem ao lado, em `budgetAmounts`, pelo
    // índice — é essa a forma que o documento tem mesmo.
    budgetItems: [{ id: "l1", label: "Decoração" }],
    budgetAmounts: [servicos],
    budgetExtras:
      extras > 0
        ? [{ id: "e1", label: "Deslocação", valueText: `${String(extras).replace(".", ",")} €` }]
        : [],
    ...(marcaAusente ? {} : { budgetExtrasSomam: somam }),
    totalAmount: escrito,
    totalVatMode: "acrescer",
    vatRate: 0.23,
  } as unknown as ProposalDoc;
}

function entrada(p: Partial<EntradaParaAuditoria> & { doc: ProposalDoc }): EntradaParaAuditoria {
  return {
    quoteId: "LIQ-1",
    nome: "Ana e João",
    estado: "enviada",
    enviada: false,
    quando: "2026-05-01T10:00:00.000Z",
    quotedPrice: null,
    ...p,
  };
}

describe("as propostas com o valor inchado", () => {
  it("três somas a mais de 140 € são vistas como três", () => {
    // 3.000 de serviços, 140 de deslocação, e o total escrito em 3.420: são as
    // três visitas da proposta que ela apanhou.
    const [s] = valoresSuspeitos([
      entrada({ doc: docDe({ servicos: 3000, extras: 140, escrito: 3420 }) }),
    ]);

    expect(s).toBeTruthy();
    expect(s.somasAMais).toBe(3);
    expect(s.degrau).toBe(140);
    expect(s.escrito).toBe(3420);
    expect(s.somaDasLinhas).toBe(3000);
    // O número que ela escreveu, e para onde isto voltaria.
    expect(s.escritoCorrigido).toBe(3000);
    // E o «Preço final» do pedido — que é sempre os serviços mais a deslocação.
    expect(s.noPedidoCorrigido).toBe(3140);
  });

  it("uma proposta sã não aparece", () => {
    expect(
      valoresSuspeitos([entrada({ doc: docDe({ servicos: 3000, extras: 140, escrito: 3000 }) })]),
    ).toEqual([]);
  });

  /** ── O LADO QUE PROTEGE DINHEIRO CERTO ─────────────────────────────── */

  it("um desconto não é uma avaria", () => {
    // Menos 200 € combinados: o total fica ABAIXO das linhas, e não acima.
    expect(
      valoresSuspeitos([entrada({ doc: docDe({ servicos: 3000, extras: 140, escrito: 2800 }) })]),
    ).toEqual([]);
  });

  it("um acerto que não dá um múltiplo dos adicionais não é uma avaria", () => {
    // +150 sobre as linhas, com uma deslocação de 140: perto, e não é.
    expect(
      valoresSuspeitos([entrada({ doc: docDe({ servicos: 3000, extras: 140, escrito: 3150 }) })]),
    ).toEqual([]);
  });

  it("com «Já incluídos» não há o que somar duas vezes", () => {
    // Sem `budgetExtrasSomam` os dois números são o mesmo, e a avaria não podia
    // acontecer. Uma diferença aqui é outra coisa qualquer — e dizer «inchada»
    // sobre ela era mandá-la corrigir o que está certo.
    expect(
      valoresSuspeitos([
        entrada({ doc: docDe({ servicos: 3000, extras: 140, escrito: 3420, somam: false }) }),
      ]),
    ).toEqual([]);
  });

  it("sem adicionais não há degrau nenhum", () => {
    expect(
      valoresSuspeitos([entrada({ doc: docDe({ servicos: 3000, extras: 0, escrito: 3420 }) })]),
    ).toEqual([]);
  });

  it("sem uma linha com preço não há com que comparar", () => {
    const doc = docDe({ servicos: 3000, extras: 140, escrito: 3420 });
    (doc as unknown as { budgetAmounts: unknown[] }).budgetAmounts = [];
    expect(valoresSuspeitos([entrada({ doc })])).toEqual([]);
  });

  it("um cêntimo de folga chega para a vírgula flutuante", () => {
    // 1.833,33 × 3 não dá exactamente 5.499,99 em vírgula flutuante.
    const [s] = valoresSuspeitos([
      entrada({ doc: docDe({ servicos: 1000, extras: 1833.33, escrito: 6499.99 }) }),
    ]);
    expect(s?.somasAMais).toBe(3);
  });

  it("as enviadas vêm à frente, e dentro delas as que mais cresceram", () => {
    const lista = valoresSuspeitos([
      entrada({
        quoteId: "por-enviar",
        enviada: false,
        doc: docDe({ servicos: 3000, extras: 140, escrito: 3420 }),
      }),
      entrada({
        quoteId: "enviada-uma-soma",
        enviada: true,
        doc: docDe({ servicos: 3000, extras: 140, escrito: 3140 }),
      }),
      entrada({
        quoteId: "enviada-duas-somas",
        enviada: true,
        doc: docDe({ servicos: 3000, extras: 140, escrito: 3280 }),
      }),
    ]);

    expect(lista.map((s) => s.quoteId)).toEqual([
      "enviada-duas-somas",
      "enviada-uma-soma",
      "por-enviar",
    ]);
  });

  it("o valor com IVA é o que o casal viu no PDF", () => {
    const [s] = valoresSuspeitos([
      entrada({ enviada: true, doc: docDe({ servicos: 3000, extras: 140, escrito: 3420 }) }),
    ]);
    // (3420 + 140) × 1,23
    expect(s.comIva).toBe(4378.8);
    // (3000 + 140) × 1,23
    expect(s.comIvaCorrigido).toBe(3862.2);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O DETECTOR NÃO VIA — OS DOIS CLIENTES REAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria em produção foi ver os 15 pedidos um a um e encontrou duas
 * propostas com o preço errado. O detector respondia «Nenhuma das 7 propostas
 * tem a assinatura desta avaria».
 *
 * Falso negativo, e do pior tipo: dá sensação de segurança sobre dinheiro que
 * já saiu num PDF para um casal. A causa era uma linha —
 * `if (!doc.budgetExtrasSomam) continue` — que saltava exactamente os
 * documentos avariados, porque a avaria É a marca estar em falta.
 *
 * Os números destes casos são os que a auditoria mediu nos dados verdadeiros.
 */
describe("as contas que não fecham entre o documento e o pedido", () => {
  it("apanha a Mónica Teófilo — 70 € de deslocação e a marca por escrever", () => {
    // Medido: preço no pedido 2.820,00 €, base do documento 2.820,00 €,
    // deslocação 70,00 €. Devia ser 2.890,00 € se os adicionais contarem.
    const [c] = contasQueNaoFecham([
      entrada({
        nome: "Mónica Teófilo",
        enviada: true,
        quotedPrice: 2820,
        doc: docDe({ servicos: 2820, extras: 70, escrito: 2820, marcaAusente: true }),
      }),
    ]);

    expect(c).toBeTruthy();
    expect(c.tipo).toBe("marca-em-falta");
    expect(c.base).toBe(2820);
    expect(c.adicionais).toBe(70);
    expect(c.noPedido).toBe(2820);
    // As duas leituras, lado a lado — a decisão é dela.
    expect(c.seSomam).toBe(2890);
    expect(c.seNaoSomam).toBe(2820);
    // E o que está em jogo com IVA: 70 × 1,23.
    expect(c.emJogoComIva).toBe(86.1);
  });

  it("e a Tara e Marty — 75 €, o mesmo defeito", () => {
    const [c] = contasQueNaoFecham([
      entrada({
        nome: "Tara e Marty",
        enviada: true,
        quotedPrice: 2460,
        doc: docDe({ servicos: 2460, extras: 75, escrito: 2460, marcaAusente: true }),
      }),
    ]);
    expect(c.tipo).toBe("marca-em-falta");
    expect(c.emJogoComIva).toBe(92.25);
  });

  /**
   * ── E ESTE É O CASO QUE O DETECTOR ANTIGO SALTAVA ────────────────────────
   * A prova de que a linha `if (!doc.budgetExtrasSomam) continue` era a causa:
   * o mesmo documento que o reconhecimento novo apanha, o antigo não vê.
   */
  it("o detector das inchadas não via nenhum destes — é por isso que este existe", () => {
    const monica = entrada({
      quotedPrice: 2820,
      doc: docDe({ servicos: 2820, extras: 70, escrito: 2820, marcaAusente: true }),
    });
    expect(valoresSuspeitos([monica])).toEqual([]);
    expect(contasQueNaoFecham([monica])).toHaveLength(1);
  });

  it("com a marca escrita e o pedido a bater certo, cala-se", () => {
    // A Carolina e a Margarida, que a auditoria verificou estarem certas.
    expect(
      contasQueNaoFecham([
        entrada({
          quotedPrice: 4330,
          doc: docDe({ servicos: 3850, extras: 480, escrito: 3850, somam: true }),
        }),
      ]),
    ).toEqual([]);
  });

  it("com a marca escrita e o pedido a NÃO bater certo, diz que está desalinhado", () => {
    const [c] = contasQueNaoFecham([
      entrada({
        quotedPrice: 3000,
        doc: docDe({ servicos: 3850, extras: 480, escrito: 3850, somam: true }),
      }),
    ]);
    expect(c.tipo).toBe("desalinhado");
    expect(c.seSomam).toBe(4330);
  });

  it("sem adicionais nenhuns não há nada que possa contar duas vezes", () => {
    expect(
      contasQueNaoFecham([
        entrada({ quotedPrice: 3000, doc: docDe({ servicos: 3000, extras: 0, escrito: 3000 }) }),
      ]),
    ).toEqual([]);
  });

  it("um pedido sem preço nenhum não é uma conta que não fecha — é uma conta por fazer", () => {
    expect(
      contasQueNaoFecham([
        entrada({
          quotedPrice: null,
          doc: docDe({ servicos: 3000, extras: 140, escrito: 3000, somam: true }),
        }),
      ]),
    ).toEqual([]);
  });

  it("as enviadas vêm primeiro, e dentro delas as que têm mais dinheiro em jogo", () => {
    const fora = contasQueNaoFecham([
      entrada({
        quoteId: "A",
        enviada: false,
        quotedPrice: 1000,
        doc: docDe({ servicos: 1000, extras: 500, escrito: 1000, marcaAusente: true }),
      }),
      entrada({
        quoteId: "B",
        enviada: true,
        quotedPrice: 2820,
        doc: docDe({ servicos: 2820, extras: 70, escrito: 2820, marcaAusente: true }),
      }),
    ]);
    expect(fora.map((c) => c.quoteId)).toEqual(["B", "A"]);
  });
});

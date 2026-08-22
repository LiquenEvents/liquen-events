import { describe, it, expect } from "vitest";
import { valoresSuspeitos, type EntradaParaAuditoria } from "./valores-inflacionados";
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
}: {
  servicos: number;
  extras: number;
  escrito: number;
  somam?: boolean;
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
    budgetExtrasSomam: somam,
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

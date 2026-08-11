import { describe, it, expect } from "vitest";
import {
  normalizarValor,
  precosDe,
  linhasDe,
  somaDosItens,
  somaDosExtras,
  desalinhamento,
  sinalESaldo,
  asDuasFormas,
  adicionarLinha,
  removerLinha,
  definirItem,
  definirPreco,
  somaDosExtrasSemIva,
} from "./proposal-budget";
import type { ProposalDoc } from "./proposal-doc";

/** As cinco linhas da proposta da Catarina, com preços plausíveis. */
const DOC = {
  budgetItems: [
    "Decoração Cerimónia",
    "Decoração Cocktail",
    "Seatting Plan e Decor Floral Seatting Plann",
    "Design Floral e Decoração Mesas",
    "Complementos dos Noivos",
  ],
  budgetAmounts: [900, 1200, 650, 3600, 525],
  budgetExtras: [],
  totalAmount: 6875,
} as unknown as ProposalDoc;

describe("normalizarValor", () => {
  /**
   * A REGRA QUE MAIS IMPORTA.
   *
   * "1.500" é mil e quinhentos, não um e meio. Sem esta distinção, escrever
   * um valor à portuguesa dava um total de 1,50 € — e a proposta saía com o
   * preço de um café, com um ar perfeitamente normal.
   */
  it("lê os milhares à portuguesa", () => {
    expect(normalizarValor("1.500")).toBe(1500);
    expect(normalizarValor("6.875")).toBe(6875);
    expect(normalizarValor("12.500")).toBe(12500);
  });

  it("aceita as formas todas que ela escreve", () => {
    expect(normalizarValor("1500")).toBe(1500);
    expect(normalizarValor("1 500 €")).toBe(1500);
    expect(normalizarValor("1.500,00 €")).toBe(1500);
    expect(normalizarValor("1.500,50")).toBe(1500.5);
    expect(normalizarValor("6875,00 € + IVA")).toBe(6875);
    expect(normalizarValor(3000)).toBe(3000);
  });

  it("um decimal com um ou dois dígitos continua a ser decimal", () => {
    // "1.5" não é mil e quinhentos.
    expect(normalizarValor("1.5")).toBe(1.5);
    expect(normalizarValor("1.50")).toBe(1.5);
  });

  it("devolve null quando não há número nenhum", () => {
    expect(normalizarValor("")).toBeNull();
    expect(normalizarValor("a definir")).toBeNull();
    expect(normalizarValor("€")).toBeNull();
    expect(normalizarValor(null)).toBeNull();
    expect(normalizarValor(undefined)).toBeNull();
  });

  it("apanha o espaço não separável de quem copia de uma folha de cálculo", () => {
    expect(normalizarValor("1 500 €")).toBe(1500);
  });
});

describe("somaDosItens", () => {
  it("soma as linhas", () => {
    expect(somaDosItens(DOC)).toBe(6875);
  });

  it("junta os valores adicionais, que são texto livre no PDF", () => {
    /**
     * ── O ADICIONAL ENTRA NA SOMA NA MESMA UNIDADE DAS LINHAS ───────────────
     *
     * O DOC não declara modo de IVA nenhum, e um documento calado lê-se com o
     * IVA INCLUÍDO — é a regra de `detectVatMode`, e é a leitura que o casal
     * faz de um «896,00 €» impresso sem mais nada ao lado.
     *
     * Logo, esses 896 € são o que ele PAGA, e valem 728,46 € de base. As
     * linhas do orçamento são todas base (são campos numéricos, sem IVA
     * escrito ao lado), e é com a BASE da proposta que esta soma vai ser
     * comparada. Somar 896 crus punha a soma 167,54 € acima do que devia — e o
     * aviso «o total não bate com a soma das linhas» acendia numa proposta que
     * estava certa.
     *
     * Numa proposta que diga «+ IVA» — no documento ou na própria linha — os
     * 896 são base e entram inteiros. Está pinado logo a seguir.
     */
    const comExtras = {
      ...DOC,
      budgetExtras: [
        { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
        { label: "Wedding Coordinator", valueText: "a definir" },
      ],
    } as unknown as ProposalDoc;
    // O "a definir" não conta — não é um número.
    expect(somaDosItens(comExtras)).toBe(7603.46); // 6875 + 896/1,23
  });

  it("num documento que diz «+ IVA», o mesmo adicional entra inteiro", () => {
    const acresce = {
      ...DOC,
      totalVatMode: "acrescer",
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 €" }],
    } as unknown as ProposalDoc;
    expect(somaDosItens(acresce)).toBe(7771);
  });

  it("e o que a própria linha declara ganha ao modo do documento", () => {
    // «896,00 € + IVA» é base, esteja o documento no modo que estiver. É a
    // intenção de quem a escreveu, e está impressa no PDF ao lado do valor.
    const linhaDiz = {
      ...DOC,
      budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 € + IVA" }],
    } as unknown as ProposalDoc;
    expect(somaDosItens(linhaDiz)).toBe(7771);
  });

  /**
   * SEM ISTO, O AVISO TOCAVA SEMPRE.
   *
   * Uma proposta ainda por orçamentar tem zero preços. Se a soma desse 0, o
   * aviso de desalinhamento aparecia em todas as propostas desde o primeiro
   * segundo — e um aviso que toca sempre deixa de ser lido.
   */
  it("sem preços nenhuns não soma zero: não soma nada", () => {
    const semPrecos = { ...DOC, budgetAmounts: [] } as unknown as ProposalDoc;
    expect(somaDosItens(semPrecos)).toBeNull();
  });

  it("uma linha a zero é um preço, e conta", () => {
    // Zero é uma resposta ("oferta"), não a ausência de resposta.
    const comZero = {
      ...DOC,
      budgetAmounts: [0, null, null, null, null],
    } as unknown as ProposalDoc;
    expect(somaDosItens(comZero)).toBe(0);
  });

  it("não devolve o lixo da vírgula flutuante", () => {
    const doc = {
      budgetItems: ["a", "b", "c"],
      budgetAmounts: [1083.33, 1083.33, 1083.34],
    } as unknown as ProposalDoc;
    expect(somaDosItens(doc)).toBe(3250);
  });
});

describe("desalinhamento", () => {
  it("cala-se quando o total bate certo", () => {
    expect(desalinhamento(DOC, 6875)).toBeNull();
  });

  it("avisa quando o total foi escrito à mão e já não bate", () => {
    // É exactamente o caso que ela descreveu: alterar um item e esquecer o total.
    const d = desalinhamento(DOC, 7500);
    expect(d).toEqual({ soma: 6875, total: 7500, diferenca: 625 });
  });

  it("cala-se quando ainda não há preços", () => {
    const semPrecos = { ...DOC, budgetAmounts: [] } as unknown as ProposalDoc;
    expect(desalinhamento(semPrecos, 6875)).toBeNull();
  });

  it("um cêntimo de diferença não é um aviso", () => {
    // A soma é feita em vírgula flutuante e o total foi escrito por uma pessoa.
    expect(desalinhamento(DOC, 6875.01)).toBeNull();
  });
});

describe("sinalESaldo", () => {
  it("30% e 70%, como nas condições dela", () => {
    expect(sinalESaldo(6875, 30)).toEqual({ sinal: 2062.5, saldo: 4812.5 });
  });

  /**
   * As duas parcelas TÊM de somar o total.
   *
   * Se fossem calculadas cada uma por si, o arredondamento comia um cêntimo e
   * a factura deixava de fechar — que é uma conversa com o contabilista.
   */
  it("as duas parcelas somam sempre o total, mesmo com arredondamento", () => {
    for (const total of [6875, 3333.33, 1000.01, 7771, 0.05]) {
      for (const pct of [30, 33, 50, 70]) {
        const { sinal, saldo } = sinalESaldo(total, pct);
        expect(Math.round((sinal + saldo) * 100) / 100).toBe(Math.round(total * 100) / 100);
      }
    }
  });

  it("uma percentagem impossível fica dentro dos limites", () => {
    expect(sinalESaldo(1000, 150).sinal).toBe(1000);
    expect(sinalESaldo(1000, -20).sinal).toBe(0);
  });
});

describe("asDuasFormas", () => {
  it("mostra o mesmo número lido das duas maneiras", () => {
    const r = asDuasFormas(6875, 0.23);
    // "+ IVA": o cliente paga 8456,25 €.
    expect(r.acrescer).toEqual({ base: 6875, iva: 1581.25, total: 8456.25 });
    // "IVA incluído": o cliente paga 6875 €, dos quais 1285,37 € são IVA.
    expect(r.incluido.total).toBe(6875);
    expect(r.incluido.base).toBe(5589.43);
    expect(r.incluido.iva).toBe(1285.57);
  });

  it("em «incluído», a base mais o IVA dão o total", () => {
    const { incluido } = asDuasFormas(6875, 0.23);
    expect(Math.round((incluido.base + incluido.iva) * 100) / 100).toBe(incluido.total);
  });
});

describe("linhas e preços andam sempre a par", () => {
  /**
   * O RISCO CONHECIDO DESTE DESENHO.
   *
   * Os preços são um array paralelo ao das linhas. Se uma remoção mexer num e
   * não no outro, os preços deslizam todos uma posição — e a proposta fica com
   * o preço da cerimónia no ramo da noiva, sem nada a assinalar. Estes testes
   * são o que impede isso.
   */
  it("remover uma linha leva o preço dela, e só o dela", () => {
    const d = removerLinha(DOC, 1); // fora "Decoração Cocktail" (1200)
    expect(d.budgetItems).toHaveLength(4);
    expect(d.budgetAmounts).toEqual([900, 650, 3600, 525]);
    expect(linhasDe(d).map((l) => l.preco)).toEqual([900, 650, 3600, 525]);
    expect(somaDosItens(d)).toBe(5675);
  });

  it("acrescentar uma linha acrescenta um preço vazio", () => {
    const d = adicionarLinha(DOC, "Tecidos suspensos");
    expect(d.budgetItems).toHaveLength(6);
    expect(d.budgetAmounts).toHaveLength(6);
    expect(d.budgetAmounts?.[5]).toBeNull();
    // Uma linha sem preço não muda a soma.
    expect(somaDosItens(d)).toBe(6875);
  });

  it("mudar o nome de uma linha não mexe no preço", () => {
    const d = definirItem(DOC, 0, "Decor Cerimónia");
    expect(d.budgetAmounts).toEqual([900, 1200, 650, 3600, 525]);
  });

  it("um documento antigo, sem preços nenhuns, não rebenta", () => {
    // Todas as propostas já gravadas estão neste estado.
    const antigo = { budgetItems: ["a", "b"] } as unknown as ProposalDoc;
    expect(precosDe(antigo)).toEqual([null, null]);
    expect(somaDosItens(antigo)).toBeNull();
    const d = definirPreco(antigo, 1, 500);
    expect(d.budgetAmounts).toEqual([null, 500]);
    expect(somaDosItens(d)).toBe(500);
  });

  it("um array de preços mais curto do que as linhas normaliza-se", () => {
    // Não devia acontecer — mas se acontecer, perde-se um preço em vez de
    // partir a leitura.
    const torto = { budgetItems: ["a", "b", "c"], budgetAmounts: [10] } as unknown as ProposalDoc;
    expect(precosDe(torto)).toEqual([10, null, null]);
  });

  it("um array de preços mais longo do que as linhas é cortado", () => {
    const torto = {
      budgetItems: ["a"],
      budgetAmounts: [10, 20, 30],
    } as unknown as ProposalDoc;
    expect(precosDe(torto)).toEqual([10]);
    expect(somaDosItens(torto)).toBe(10);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS VALORES ADICIONAIS VALEM DINHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A deslocação da equipa, o wedding coordinator, os tecidos. São escritos como
 * TEXTO na proposta («896,00 €», «895,00 € + IVA», «a definir») porque é assim
 * que aparecem nas propostas verdadeiras — e é o estúdio que os soma ao total,
 * que é o mesmo número de onde saem o sinal de 30% e a factura.
 *
 * Ler mal um destes textos é dinheiro a menos ou a mais numa factura.
 */
describe("somaDosExtras", () => {
  it("soma o que consegue ler", () => {
    expect(
      somaDosExtras([
        { label: "Deslocação da equipa Líquen", valueText: "1.550,00 €" },
        { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
      ]),
    ).toBe(2445);
  });

  it("o que não tem número não conta — e não estraga a soma", () => {
    expect(
      somaDosExtras([
        { label: "Deslocação", valueText: "1.550,00 €" },
        { label: "Mobiliário", valueText: "a definir" },
        { label: "Tecidos", valueText: "" },
      ]),
    ).toBe(1550);
  });

  it("sem extras nenhuns é zero, para poder somar-se sempre", () => {
    expect(somaDosExtras([])).toBe(0);
    expect(somaDosExtras(undefined)).toBe(0);
  });

  it("«1.500» é mil e quinhentos, e não um e meio", () => {
    // A mesma regra do resto do ficheiro: sem ela, uma deslocação de 1.500 €
    // entrava na factura como 1,50 €.
    expect(somaDosExtras([{ label: "Deslocação", valueText: "1.500" }])).toBe(1500);
  });

  it("arredonda ao cêntimo — somar floats dá 0,30000000000000004", () => {
    expect(
      somaDosExtras([
        { label: "a", valueText: "0,10" },
        { label: "b", valueText: "0,20" },
      ]),
    ).toBe(0.3);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «+ IVA» QUE A LINHA DECLARA TEM DE CONTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo a que isto se soma é a BASE («Preço final (sem IVA)»), e é dele que
 * saem a factura, o sinal e o saldo. Somar «895,00 €» e «895,00 € + IVA» da
 * mesma maneira faz a linha e o total dizerem números diferentes sobre a mesma
 * coisa, no mesmo documento que vai para o casal.
 */
describe("somaDosExtrasSemIva", () => {
  const IVA = { mode: "incluido" as const, vatRate: 0.23 };
  const SEM = { mode: "acrescer" as const, vatRate: 0.23 };

  it("«+ IVA» é líquido e entra tal e qual, em qualquer documento", () => {
    const linha = [{ label: "Coordenação", valueText: "895,00 € + IVA" }];
    expect(somaDosExtrasSemIva(linha, IVA)).toBe(895);
    expect(somaDosExtrasSemIva(linha, SEM)).toBe(895);
  });

  it("uma linha calada num documento COM IVA é bruta, e converte-se", () => {
    // 895 / 1,23 = 727,64 de base. Somar 895 punha no total mais 1.101 do que
    // o casal vai pagar, quando a linha lhe prometeu 895.
    expect(somaDosExtrasSemIva([{ label: "Deslocação", valueText: "895,00 €" }], IVA)).toBe(727.64);
  });

  it("uma linha calada num documento SEM IVA é líquida", () => {
    expect(somaDosExtrasSemIva([{ label: "Deslocação", valueText: "895,00 €" }], SEM)).toBe(895);
  });

  it("«IVA incluído» escrito na linha ganha ao modo do documento", () => {
    const linha = [{ label: "Tecidos", valueText: "1.230,00 € (IVA incluído)" }];
    expect(somaDosExtrasSemIva(linha, SEM)).toBe(1000);
  });

  it("sem contexto nenhum, líquido — é o comportamento de sempre", () => {
    expect(somaDosExtrasSemIva([{ label: "X", valueText: "1.550,00 €" }])).toBe(1550);
  });

  it("«a definir» não conta e não estraga a soma das outras", () => {
    expect(
      somaDosExtrasSemIva(
        [
          { label: "Deslocação", valueText: "a definir" },
          { label: "Coordenação", valueText: "1.500,00 € + IVA" },
        ],
        IVA,
      ),
    ).toBe(1500);
  });
});

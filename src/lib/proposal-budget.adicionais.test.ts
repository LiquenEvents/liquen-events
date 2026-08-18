import { describe, it, expect } from "vitest";
import { totaisDaProposta, dinheiroDaProposta, type DocComLinhasETotal } from "./proposal-budget";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DESLOCAÇÃO SAI DE DENTRO DO VALOR, OU SOMA-SE A ELE?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre uma proposta que já tinha seguido: «aparece "Subtotal
 * dos serviços 2.860" e depois "+140 de deslocação". Isso está mal, porque nós
 * tínhamos dito que era três mil MAIS cento e quarenta de deslocação, e depois
 * mais o IVA.»
 *
 * As duas leituras são legítimas — e a diferença, nesse caso, são 172,20 € que
 * o casal paga ou não paga. Por isso passou a ser uma escolha por proposta, e
 * não uma regra que o programa adivinha.
 */

const deslocacao = { label: "Deslocação Equipa Líquen", valueText: "140,00 €" };

const proposta = (over: Partial<DocComLinhasETotal> = {}): DocComLinhasETotal => ({
  budgetItems: ["Decoração Cerimónia"],
  budgetAmounts: [0],
  budgetExtras: [deslocacao],
  totalAmount: 3000,
  totalVatMode: "acrescer",
  vatRate: 0.23,
  ...over,
});

describe("os valores adicionais somam ao valor escrito", () => {
  it("o caso dela: 3000 de serviços + 140 de deslocação + IVA = 3862,20 €", () => {
    const t = totaisDaProposta(proposta({ budgetExtrasSomam: true }), 30);
    expect(t.servicos).toBe(3000);
    expect(t.adicionais).toBe(140);
    expect(t.total).toBe(3140);
    expect(t.iva).toBe(722.2);
    expect(t.aPagar).toBe(3862.2);
    expect(t.fecha).toBe(true);
  });

  it("sem a escolha, nada muda: continua a sair o que saía antes", () => {
    // É o quadro que ela viu no PDF da Melanie e do Sebastien. Uma proposta
    // antiga, gravada sem este campo, tem de continuar a ler-se assim para
    // sempre — o casal tem-na no email e pode já ter pago o sinal sobre ela.
    const t = totaisDaProposta(proposta(), 30);
    expect(t.servicos).toBe(2860);
    expect(t.adicionais).toBe(140);
    expect(t.total).toBe(3000);
    expect(t.iva).toBe(690);
    expect(t.aPagar).toBe(3690);
    expect(t.fecha).toBe(true);
  });

  it("no modo «IVA incluído», o que soma é o bruto da linha, e o quadro fecha", () => {
    // A linha diz «140,00 €» e o documento lê-se com IVA: os 140 são o que o
    // casal paga por ela, não a base. O total a pagar sobe exactamente 140.
    const t = totaisDaProposta(
      proposta({ totalAmount: 3690, totalVatMode: "incluido", budgetExtrasSomam: true }),
      30,
    );
    expect(t.aPagar).toBe(3830);
    expect(t.total + t.iva).toBe(t.aPagar);
    expect(t.fecha).toBe(true);
  });

  it("o sinal e o saldo são calculados sobre o total NOVO", () => {
    // O defeito que isto impede: o PDF a dizer 3.862,20 € e o sinal a ser
    // cobrado sobre 3.690 €. Já aconteceu nesta casa, por outro caminho.
    const t = totaisDaProposta(proposta({ budgetExtrasSomam: true }), 30);
    expect(t.sinal + t.saldo).toBe(t.aPagar);
    expect(t.sinal).toBe(1158.66);
  });

  it("uma proposta sem adicionais lê-se igual nos dois modos", () => {
    const semExtras = { budgetExtras: [] };
    const a = dinheiroDaProposta(proposta({ ...semExtras, budgetExtrasSomam: true }));
    const b = dinheiroDaProposta(proposta(semExtras));
    expect(a).toEqual(b);
  });
});

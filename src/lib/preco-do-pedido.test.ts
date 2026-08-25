import { describe, it, expect } from "vitest";
import {
  baseParaOEstudio,
  precoDoPedidoParaBase,
  degrauDosAdicionais,
  type ContextoDoPreco,
} from "./preco-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO NÃO PODE MUDAR SÓ POR SE ABRIR A PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, hoje: «sempre que vou à proposta os valores estão diferentes».
 *
 * Abrir uma proposta faz uma ida e volta: o preço do PEDIDO entra no campo do
 * ESTÚDIO (menos os adicionais), e a gravação manda-o de volta ao pedido (mais
 * os adicionais). Se as duas contas não forem exactamente inversas, cada
 * abertura desloca o número — e a deslocação acumula.
 *
 * Foi medido numa proposta real: 3.000 → 3.140 → 3.280 → 3.420, com uma
 * deslocação de 140 €. Uma soma por visita.
 *
 * É esta a rede.
 */

const doc = (p: Partial<ContextoDoPreco> = {}): ContextoDoPreco => ({
  budgetExtras: [],
  budgetExtrasSomam: true,
  totalVatMode: "acrescer",
  totalText: "",
  totalEstimatedText: "",
  ...p,
});

const COM_DESLOCACAO = doc({
  budgetExtras: [{ label: "Deslocação", valueText: "140,00 € + IVA" }],
});

describe("a ida e volta do preço", () => {
  it("abrir e gravar devolve o MESMO número, e não um maior", () => {
    const base = baseParaOEstudio(3140, COM_DESLOCACAO);
    expect(base).toBe(3000);
    expect(precoDoPedidoParaBase(base!, COM_DESLOCACAO)).toBe(3140);
  });

  it("dez aberturas seguidas não deslocam o preço um cêntimo", () => {
    // É esta a afirmação que interessa: a avaria não se via numa ida e volta,
    // via-se ao fim de umas quantas.
    let noPedido = 3140;
    for (let i = 0; i < 10; i += 1) {
      const base = baseParaOEstudio(noPedido, COM_DESLOCACAO);
      expect(base).not.toBeNull();
      noPedido = precoDoPedidoParaBase(base!, COM_DESLOCACAO);
    }
    expect(noPedido).toBe(3140);
  });

  it("sem adicionais a somar, o preço do pedido É o do estúdio", () => {
    const semSomar = doc({
      budgetExtras: [{ label: "Deslocação", valueText: "140,00 € + IVA" }],
      budgetExtrasSomam: false,
    });
    expect(degrauDosAdicionais(semSomar)).toBe(0);
    expect(baseParaOEstudio(3000, semSomar)).toBe(3000);
    expect(precoDoPedidoParaBase(3000, semSomar)).toBe(3000);
  });

  it("com IVA incluído, o degrau é a base do adicional e não o bruto", () => {
    // Um adicional escrito «172,20 €» com IVA dentro vale 140 € de base. Somar
    // o bruto ao campo (que é sem IVA) inflacionava-o em 32,20 € por visita.
    const incluido = doc({
      totalVatMode: "incluido",
      budgetExtras: [{ label: "Deslocação", valueText: "172,20 €" }],
    });
    expect(degrauDosAdicionais(incluido)).toBe(140);
    const base = baseParaOEstudio(3140, incluido);
    expect(base).toBe(3000);
    expect(precoDoPedidoParaBase(base!, incluido)).toBe(3140);
  });

  it("um preço com mais de dois decimais não perde cêntimos na volta", () => {
    const base = baseParaOEstudio(3140.004, COM_DESLOCACAO);
    expect(precoDoPedidoParaBase(base!, COM_DESLOCACAO)).toBe(3140);
  });

  /**
   * ── O ZERO QUE FAZIA O PREÇO SUBIR ────────────────────────────────────
   *
   * A ida devolvia ZERO quando o preço do pedido era menor do que os
   * adicionais. E zero é uma mentira com consequências: a volta mandava
   * 0 + 140 = 140 € para o pedido, e um pedido de 100 € passava a 140 € sem
   * ninguém lhe ter tocado.
   *
   * A conta não é impossível por acaso — é um estado por arrumar. A resposta
   * certa é dizê-lo, e não inventar um número redondo.
   */
  it("um preço menor do que os adicionais não vira zero — nem sobe sozinho", () => {
    expect(baseParaOEstudio(100, COM_DESLOCACAO)).toBeNull();
  });

  it("nem quando bate certo ao cêntimo com os adicionais", () => {
    // 140 − 140 = 0. Um campo a dizer «0» num sítio onde não há serviços é
    // exactamente o caso em que o estado tem de ser dito, não arredondado.
    expect(baseParaOEstudio(140, COM_DESLOCACAO)).toBeNull();
  });

  it("um pedido ainda sem preço não inventa nenhum", () => {
    expect(baseParaOEstudio(0, COM_DESLOCACAO)).toBeNull();
    expect(baseParaOEstudio(-5, COM_DESLOCACAO)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { ENGOLIDO_PELO_TECLADO_PX, barraDeveSumir, tecladoAberto } from "./barra-de-destinos";

/**
 * O que estes casos guardam, por ordem de importância:
 *
 *  1. que a barra NÃO se esconde quando o detalhe é a coluna ao lado — que é o
 *     defeito relatado («às vezes não está em lado nenhum») e o único que já
 *     custou trabalho a quem usa isto;
 *  2. que continua a esconder-se quando o detalhe é mesmo uma folha modal;
 *  3. que a barra de endereço a recolher-se NÃO passa por teclado, e que um
 *     teclado a sério passa.
 */

describe("quando é que a barra de destinos se afasta", () => {
  it("fica quando o detalhe é a coluna ao lado — o defeito que ela relatou", () => {
    expect(barraDeveSumir({ detalheSobreposto: false, tecladoAberto: false })).toBe(false);
  });

  it("sai quando o detalhe é uma folha modal", () => {
    expect(barraDeveSumir({ detalheSobreposto: true, tecladoAberto: false })).toBe(true);
  });

  it("sai enquanto o teclado ocupa o fundo", () => {
    expect(barraDeveSumir({ detalheSobreposto: false, tecladoAberto: true })).toBe(true);
  });

  /**
   * O CONTROLO NEGATIVO DESTE FICHEIRO.
   *
   * Sem ele, uma regra que devolvesse `true` a tudo passava nos três casos
   * acima e escondia a barra para sempre — que é precisamente a queixa.
   */
  it("com o ecrã em repouso não há motivo nenhum para ela sair", () => {
    expect(barraDeveSumir({ detalheSobreposto: false, tecladoAberto: false })).toBe(false);
  });
});

describe("distinguir o teclado do resto", () => {
  /** Um iPhone 14 em retrato: 844 de layout, e o teclado leva ~336. */
  it("reconhece o teclado do telemóvel", () => {
    expect(tecladoAberto(844, 508)).toBe(true);
  });

  /**
   * A barra de endereço do Safari a recolher-se ao rolar: ~60 px. Se isto
   * passasse por teclado, a barra de destinos piscava a cada rolo de dedo —
   * seria trocar um defeito por um pior.
   */
  it("não confunde a barra de endereço a recolher-se com um teclado", () => {
    expect(tecladoAberto(844, 784)).toBe(false);
    expect(tecladoAberto(844, 788)).toBe(false); // Chrome do Android, ~56 px
  });

  it("o limiar é exactamente o que o módulo publica", () => {
    expect(tecladoAberto(1000, 1000 - ENGOLIDO_PELO_TECLADO_PX)).toBe(true);
    expect(tecladoAberto(1000, 1000 - ENGOLIDO_PELO_TECLADO_PX + 1)).toBe(false);
  });

  it("no computador, onde nada encolhe, não há teclado nenhum", () => {
    expect(tecladoAberto(900, 900)).toBe(false);
  });

  /**
   * Números que não são números, e a janela visual MAIOR do que a de layout —
   * o que acontece a meio de um gesto de zoom. Na dúvida a barra fica, porque o
   * defeito que estamos a fechar é ela faltar.
   */
  it("na dúvida não inventa um teclado", () => {
    expect(tecladoAberto(Number.NaN, 500)).toBe(false);
    expect(tecladoAberto(844, Number.NaN)).toBe(false);
    expect(tecladoAberto(0, 0)).toBe(false);
    expect(tecladoAberto(844, 900)).toBe(false);
  });
});

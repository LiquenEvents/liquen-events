import { describe, expect, it } from "vitest";
import {
  CHAO_DA_COLUNA_DE_DETALHE_PX,
  ENGOLIDO_PELO_TECLADO_PX,
  alturaQueSobraParaODetalhe,
  barraDeveSumir,
  tecladoAberto,
} from "./barra-de-destinos";

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

describe("o espaço que a barra ocupa, guardado por quem fica por baixo", () => {
  /**
   * Os números MEDIDOS num Chromium de 1440×900, com um pedido aberto na
   * coluna: a linha da grelha arranca a 341 px do topo, e a faixa da barra de
   * destinos vai de 816 a 900 — 84 px, que são os 72 da cápsula mais os 12 de
   * folga por baixo dela.
   *
   * 84 e não 86: o token `--bo-barra-inferior` diz 86 e a barra mede 84. É por
   * isso que quem reserva o espaço mede o ELEMENTO — e é por isso que o número
   * que entra aqui é o medido.
   */
  const JANELA = 900;
  const TOPO = 341;
  const BARRA = 84;

  it("a coluna acaba onde a barra começa, e não por baixo dela", () => {
    const altura = alturaQueSobraParaODetalhe(JANELA, TOPO, BARRA);
    expect(TOPO + altura).toBe(JANELA - BARRA);
  });

  /**
   * O CONTROLO NEGATIVO, E É O DEFEITO EXACTO QUE ISTO FECHA.
   *
   * Aqui estava um 16 — a folga de 1rem que bastava quando a barra de destinos
   * não existia nesta largura. Com ela a existir, reservar 16 punha o pé da
   * coluna 70 px DENTRO da barra, e o pé da coluna é onde vive o botão de
   * guardar. Se alguém voltar a pôr uma folga cosmética no lugar da altura da
   * barra, é aqui que se sabe.
   */
  it("reservar só a folga de 1rem punha o pé da coluna dentro da barra", () => {
    const comFolgaSo = alturaQueSobraParaODetalhe(JANELA, TOPO, 16);
    expect(TOPO + comFolgaSo).toBeGreaterThan(JANELA - BARRA);
    expect(TOPO + comFolgaSo - (JANELA - BARRA)).toBe(BARRA - 16);
  });

  it("sem barra nenhuma usa o ecrã todo — é o que o telemóvel não precisa", () => {
    expect(alturaQueSobraParaODetalhe(JANELA, TOPO, 0)).toBe(JANELA - TOPO);
  });

  /**
   * Uma janela muito baixa (um portátil velho, ou a janela do browser
   * encolhida) daria uma coluna de 100 px onde não cabe nada. O chão é
   * deliberado: mais vale uma coluna curta que ROLA.
   */
  it("numa janela muito baixa devolve o chão, e não uma coluna inútil", () => {
    expect(alturaQueSobraParaODetalhe(500, 341, 86)).toBe(CHAO_DA_COLUNA_DE_DETALHE_PX);
    expect(alturaQueSobraParaODetalhe(300, 341, 86)).toBe(CHAO_DA_COLUNA_DE_DETALHE_PX);
  });

  it("na dúvida sobre a altura da barra não reserva a esmo", () => {
    for (const mau of [Number.NaN, -20, Number.POSITIVE_INFINITY]) {
      expect(alturaQueSobraParaODetalhe(JANELA, TOPO, mau)).toBe(JANELA - TOPO);
    }
  });
});

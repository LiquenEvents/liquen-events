import { describe, it, expect } from "vitest";
import {
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  TEXTO_DO_MOODBOARD as TXT,
  alturaDaLegenda,
  linhasDaLegendaAprox,
} from "./proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS LINHAS DE TEXTO DA PÁGINA DE MOOD BOARD
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas medidas estavam escritas à mão em dois sítios — no gerador do PDF e na
 * pré-visualização do estúdio, com números diferentes. O sintoma era uma
 * miniatura que mostrava o título 34 pontos acima de onde ele sai; a causa era
 * não haver um sítio só onde estas quatro linhas vivem.
 *
 * O que aqui se prende é o que faz a miniatura valer: a legenda RESERVA altura
 * às fotografias, e essa reserva cresce com o texto.
 */

describe("TEXTO_DO_MOODBOARD", () => {
  it("escreve dentro da mancha, com as margens da folha", () => {
    for (const linha of [TXT.sobretitulo, TXT.titulo, TXT.subtitulo]) {
      expect(linha.base).toBeLessThan(PAGINA_H - PAGINA_M);
      expect(linha.base).toBeGreaterThan(PAGINA_M);
    }
    // A ordem de leitura, de cima para baixo: sobretítulo, título, subtítulo.
    expect(TXT.sobretitulo.base).toBeGreaterThan(TXT.titulo.base);
    expect(TXT.titulo.base).toBeGreaterThan(TXT.subtitulo.base);
  });

  it("deixa a mancha de texto dentro da largura útil", () => {
    expect(PAGINA_W - 2 * PAGINA_M).toBeGreaterThan(0);
    expect(TXT.legenda.tamanho).toBeLessThan(TXT.titulo.tamanho);
  });
});

describe("alturaDaLegenda", () => {
  it("sem legenda reserva só o fio que impede as fotos de colarem à margem", () => {
    expect(alturaDaLegenda(0)).toBe(TXT.legenda.reservaSemLegenda);
  });

  it("cada linha custa uma entrelinha, mais a folga", () => {
    expect(alturaDaLegenda(1)).toBe(TXT.legenda.entrelinha + TXT.legenda.folga);
    expect(alturaDaLegenda(5) - alturaDaLegenda(4)).toBe(TXT.legenda.entrelinha);
  });

  /** Cinco linhas comem 87 pontos: 15% da altura da folha, tirados às fotos. */
  it("uma descrição comprida rouba uma fatia visível da página", () => {
    expect(alturaDaLegenda(TXT.legenda.maxLinhas) / PAGINA_H).toBeGreaterThan(0.13);
  });
});

describe("linhasDaLegendaAprox", () => {
  it("sem texto não há linhas", () => {
    expect(linhasDaLegendaAprox(undefined)).toBe(0);
    expect(linhasDaLegendaAprox("   ")).toBe(0);
  });

  it("uma frase curta é uma linha", () => {
    expect(linhasDaLegendaAprox("Verdes, brancos e um toque de terracotta.")).toBe(1);
  });

  it("um texto comprido passa a várias, e nunca mais do que o desenho imprime", () => {
    const enorme = Array.from({ length: 400 }, () => "palavra").join(" ");
    expect(linhasDaLegendaAprox(enorme)).toBe(TXT.legenda.maxLinhas);
  });

  it("respeita as mudanças de linha escritas à mão", () => {
    expect(linhasDaLegendaAprox("Uma\nDuas\nTrês")).toBe(3);
  });

  it("uma palavra maior do que a linha não entra em ciclo nem conta a dobrar", () => {
    expect(linhasDaLegendaAprox("a".repeat(500))).toBe(1);
  });
});

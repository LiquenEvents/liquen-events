import { describe, it, expect } from "vitest";
import { TECTO_DA_BARRA, avancoDoEnvio, passoDoEnvio } from "./envio-em-curso";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA BARRA QUE NÃO MENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «ao enviar a proposta quero que haja uma animação que eu
 * perceba que está a ser enviado».
 *
 * O que se prende aqui é a única coisa que uma barra sem progresso real pode
 * prometer: que anda, que abranda, e que não chega ao fim sozinha.
 */

const ESTIMADO = 10_000;

describe("o avanço da barra", () => {
  it("começa em zero", () => {
    expect(avancoDoEnvio(0, ESTIMADO)).toBe(0);
  });

  it("anda sempre para a frente", () => {
    let antes = 0;
    for (let t = 500; t <= 60_000; t += 500) {
      const agora = avancoDoEnvio(t, ESTIMADO);
      expect(agora).toBeGreaterThanOrEqual(antes);
      antes = agora;
    }
  });

  it("abranda: o primeiro terço do tempo vale mais do que o último", () => {
    // É isto que diz «está a andar, e não sei quanto falta» sem o dizer por
    // palavras. Uma recta prometia uma precisão que não existe.
    const primeiro = avancoDoEnvio(ESTIMADO / 3, ESTIMADO);
    const ultimo = avancoDoEnvio(ESTIMADO, ESTIMADO) - avancoDoEnvio((2 * ESTIMADO) / 3, ESTIMADO);
    expect(primeiro).toBeGreaterThan(ultimo * 2);
  });

  /** O que fecha a barra é a resposta. Nunca ela própria. */
  it("nunca chega ao fim, por muito que espere", () => {
    expect(avancoDoEnvio(10 * 60_000, ESTIMADO)).toBeLessThan(TECTO_DA_BARRA + 1e-9);
    expect(avancoDoEnvio(10 * 60_000, ESTIMADO)).toBeLessThan(1);
  });

  it("no tempo estimado já vai bem lá", () => {
    // Se a estimativa acertar, a barra está quase cheia quando a resposta
    // chega — que é o que faz o fecho parecer um fecho e não um salto.
    expect(avancoDoEnvio(ESTIMADO, ESTIMADO)).toBeGreaterThan(0.8);
  });

  it("sem estimativa não inventa avanço nenhum", () => {
    expect(avancoDoEnvio(5000, 0)).toBe(0);
  });
});

describe("o que o servidor está a fazer", () => {
  it.each([
    [0, "A desenhar o PDF…"],
    [4000, "A desenhar o PDF…"],
    [6000, "A guardar a proposta…"],
    [9000, "A enviar o email…"],
    [12_000, "A enviar o email…"],
  ])("aos %i ms diz «%s»", (ms, esperado) => {
    expect(passoDoEnvio(ms, ESTIMADO)).toBe(esperado);
  });

  /**
   * PASSADO O DOBRO, DEIXA DE FINGIR.
   *
   * A ordem dos passos é real; o relógio é uma estimativa. Quando a estimativa
   * já foi ao dobro, continuar a contar passos era inventar — e o que faz falta
   * nesse momento é outra coisa: numa quinta, com 4G fraco, é «não feches isto».
   */
  it("muito depois do estimado, diz o que interessa", () => {
    expect(passoDoEnvio(30_000, ESTIMADO)).toContain("não feches o separador");
  });

  /** Nunca «enviado»: quem dá o envio por feito é a resposta. */
  it("o último passo nunca é um facto consumado", () => {
    for (const ms of [9000, 12_000, 19_000]) {
      expect(passoDoEnvio(ms, ESTIMADO)).not.toMatch(/enviad[oa]/i);
    }
  });
});

import { describe, expect, it } from "vitest";
import { NO_ESTIMADO, TECTO_DA_BARRA, avancoDaEspera, esperaDemorada } from "./espera-em-curso";

/**
 * A BARRA DAS ESPERAS OPACAS — o que o sistema de design pede (§10): mantém em
 * movimento, distribui o avanço uniformemente, e nunca chega ao fim sozinha.
 */

const E = 10_000;

describe("avancoDaEspera", () => {
  it("anda a passo certo até ao tempo estimado", () => {
    expect(avancoDaEspera(E / 4, E)).toBeCloseTo(NO_ESTIMADO / 4, 6);
    expect(avancoDaEspera(E / 2, E)).toBeCloseTo(NO_ESTIMADO / 2, 6);
    expect(avancoDaEspera(E, E)).toBeCloseTo(NO_ESTIMADO, 6);
  });

  it("depois do estimado continua a andar, e cada vez mais devagar", () => {
    const a = avancoDaEspera(1.5 * E, E);
    const b = avancoDaEspera(2 * E, E);
    const c = avancoDaEspera(3 * E, E);
    expect(a).toBeGreaterThan(NO_ESTIMADO);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c - b).toBeLessThan(b - a);
  });

  it("não tem esquina no estimado: a velocidade é a mesma dos dois lados", () => {
    const h = E / 1000;
    const antes = (avancoDaEspera(E, E) - avancoDaEspera(E - h, E)) / h;
    const depois = (avancoDaEspera(E + h, E) - avancoDaEspera(E, E)) / h;
    expect(depois).toBeCloseTo(antes, 6);
  });

  it("anda sempre para a frente, e nunca passa o tecto", () => {
    let antes = 0;
    for (let t = 100; t <= 20 * E; t += 100) {
      const agora = avancoDaEspera(t, E);
      expect(agora).toBeGreaterThanOrEqual(antes);
      // Ao fim de muito tempo a conta chega ao tecto por arredondamento — o que
      // importa é que não o passa, e que nunca é 1.
      expect(agora).toBeLessThanOrEqual(TECTO_DA_BARRA);
      expect(agora).toBeLessThan(1);
      antes = agora;
    }
  });

  it("sem estimativa, ou antes de começar, não inventa avanço", () => {
    expect(avancoDaEspera(5_000, 0)).toBe(0);
    expect(avancoDaEspera(0, E)).toBe(0);
    expect(avancoDaEspera(-1, E)).toBe(0);
  });
});

describe("esperaDemorada", () => {
  it("só passado o dobro do estimado", () => {
    expect(esperaDemorada(2 * E, E)).toBe(false);
    expect(esperaDemorada(2 * E + 1, E)).toBe(true);
    expect(esperaDemorada(60_000, 0)).toBe(false);
  });
});

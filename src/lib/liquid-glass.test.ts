import { describe, expect, it } from "vitest";
import { sdf, suportado } from "./liquid-glass";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DO VIDRO — o que se pode medir sem um ecrã
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O motor desenha em `canvas` e lê `CSS.supports`, e nenhuma das duas coisas
 * existe aqui. O que EXISTE, e é onde o efeito nasce, é a função de distância:
 * o mapa de refracção é `∇d` normalizado dentro da faixa do bisel, e por isso um
 * `sdf` errado dá vidro errado em todas as superfícies ao mesmo tempo, sem uma
 * única excepção a acusar.
 *
 * Estes casos são a fronteira, o dentro, o fora e o canto — as quatro coisas de
 * que o resto depende.
 */

describe("a distância com sinal ao rectângulo de cantos redondos", () => {
  it("é zero na aresta, e é isso que põe o bisel onde a aresta está", () => {
    // Meio do lado esquerdo e meio do lado de cima de um 200×100 de raio 20.
    expect(sdf(0, 50, 200, 100, 20)).toBeCloseTo(0, 6);
    expect(sdf(100, 0, 200, 100, 20)).toBeCloseTo(0, 6);
    expect(sdf(200, 50, 200, 100, 20)).toBeCloseTo(0, 6);
    expect(sdf(100, 100, 200, 100, 20)).toBeCloseTo(0, 6);
  });

  it("no centro vale a distância à aresta mais próxima, com sinal negativo", () => {
    /* E é o que faz o centro do mapa ficar exactamente a 128,128 — vidro limpo,
       sem distorção nenhuma. Um centro que não fosse plano entortava o texto que
       passa por baixo do vidro, que é o defeito mais visível que isto pode ter. */
    expect(sdf(100, 50, 200, 100, 20)).toBeCloseTo(-50, 6);
    expect(sdf(150, 150, 300, 300, 40)).toBeCloseTo(-150, 6);
  });

  it("é positiva fora, que é onde o mapa não toca", () => {
    expect(sdf(-10, 50, 200, 100, 20)).toBeCloseTo(10, 6);
    expect(sdf(100, -25, 200, 100, 20)).toBeCloseTo(25, 6);
  });

  it("o canto é um arco de raio `r`, e não um bico", () => {
    /* O ponto do arco a 45° do centro do canto tem de estar EM CIMA da fronteira.
       Sem isto, um raio grande dava um canto quadrado por dentro do redondo — e o
       bisel seguia o bico em vez de seguir o desenho. */
    const r = 20;
    const cx = r;
    const cy = r; // centro do arco do canto superior esquerdo
    const k = Math.SQRT1_2;
    expect(sdf(cx - r * k, cy - r * k, 200, 100, r)).toBeCloseTo(0, 6);
    // E meio raio para dentro do arco são meio raio de profundidade.
    expect(sdf(cx - r * k * 0.5, cy - r * k * 0.5, 200, 100, r)).toBeCloseTo(-r / 2, 6);
  });

  it("com raio zero é o rectângulo de sempre", () => {
    expect(sdf(0, 0, 200, 100, 0)).toBeCloseTo(0, 6);
    expect(sdf(100, 50, 200, 100, 0)).toBeCloseTo(-50, 6);
  });
});

describe("o suporte pergunta-se antes, e no servidor é não", () => {
  it("sem `CSS` no ambiente, não há vidro nenhum a tentar", () => {
    /* Isto corre em Node, sem DOM: é o mesmo caminho que o servidor percorre
       quando desenha a página. Um `CSS.supports` chamado às cegas aqui era um
       `ReferenceError` no meio do render do servidor — página inteira em branco,
       e não um vidro em falta. */
    expect(suportado()).toBe(false);
  });
});

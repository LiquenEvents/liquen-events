import { describe, it, expect } from "vitest";
import { MOLA, DUR_VISTA_MS } from "./tokens";
import { percurso, duracaoMs } from "./mola";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MOLA TEM DE ASSENTAR, E NÃO SALTITAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O erro clássico da mola em interfaces é a oscilação. Fica giro numa demo e,
 * num painel onde se arrastam quarenta fotografias, parece que o programa não
 * está seguro do que fez. Estes testes prendem o comportamento — não os
 * números, que se podem afinar, mas o que os números têm de produzir.
 */

describe("a mola", () => {
  it("assenta exactamente no sítio, e não perto dele", () => {
    const p = percurso({ x: 120, y: -80 });
    const fim = p[p.length - 1];
    // Parar a 0,3 px do sítio deixava uma grelha inteira ligeiramente ao lado.
    expect(fim.x).toBe(0);
    expect(fim.y).toBe(0);
  });

  it("não passa do sítio de forma visível — é quase crítica, não elástica", () => {
    const p = percurso({ x: 100, y: 0 });
    // Depois de cruzar o zero, o quanto recua é o que se lê como saltar.
    const recuoMaximo = Math.max(0, ...p.map((q) => -q.x));
    expect(
      recuoMaximo,
      `a mola recuou ${recuoMaximo.toFixed(1)}px depois de chegar — está a saltitar`,
    ).toBeLessThan(2);
  });

  it("e não cruza o zero mais do que uma vez", () => {
    const p = percurso({ x: 100, y: 0 });
    let cruzamentos = 0;
    for (let i = 1; i < p.length; i += 1) {
      if (Math.sign(p[i].x) !== Math.sign(p[i - 1].x) && p[i].x !== 0) cruzamentos += 1;
    }
    expect(cruzamentos).toBeLessThanOrEqual(1);
  });

  it("assenta num tempo que se lê como resposta, não como espera", () => {
    // Um arrasto de meio ecrã num telemóvel.
    const ms = duracaoMs({ x: 200, y: 0 });
    expect(ms).toBeGreaterThan(DUR_VISTA_MS / 2);
    expect(ms, `${Math.round(ms)}ms é uma mola preguiçosa`).toBeLessThan(700);
  });

  it("largar parado não anima nada", () => {
    // Sem distância e sem velocidade não há viagem — e um quadro pintado à
    // toa é um quadro que pisca.
    expect(percurso({ x: 0, y: 0 }, { x: 0, y: 0 })).toHaveLength(0);
  });

  /**
   * A VELOCIDADE DO GESTO CONTINUA A VIAGEM.
   *
   * É o que faz a mola parecer física em vez de uma animação a começar do
   * zero. Prende-se a RELAÇÃO e não um número: quanto mais depressa se larga,
   * mais longe vai. Um limiar absoluto aqui só diria quão rígida está a mola
   * hoje — e ficaria vermelho na primeira afinação legítima.
   */
  it("quanto mais depressa se larga, mais longe vai", () => {
    const longe = (v: number) =>
      Math.max(0, ...percurso({ x: 0, y: 0 }, { x: v, y: 0 }).map((p) => p.x));
    const devagar = longe(200);
    const depressa = longe(900);
    expect(devagar).toBeGreaterThan(0);
    expect(depressa).toBeGreaterThan(devagar * 2);
  });

  it("uma mola sem travão seria elástica — o teste acima só vale por causa dele", () => {
    // Controlo positivo: com o amortecimento a zero a mola nunca assentaria.
    // Se este teste passar a falhar, é porque o `percurso` deixou de simular
    // física e passou a interpolar — e os testes de cima perdem o sentido.
    const critico = 2 * Math.sqrt(MOLA.rigidez * MOLA.massa);
    expect(
      MOLA.amortecimento,
      "o amortecimento passou do crítico: a mola deixa de ser mola e passa a travão",
    ).toBeLessThan(critico);
    expect(
      MOLA.amortecimento,
      "amortecimento a menos de metade do crítico — vai saltitar",
    ).toBeGreaterThan(critico * 0.5);
  });
});

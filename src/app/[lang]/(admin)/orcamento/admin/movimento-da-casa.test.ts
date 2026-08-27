import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CURVA, DUAS VELOCIDADES, UM DEGRAU COM TECTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Da análise medida da Apple e da Pixelmatters, o que sobra quando se retira a
 * diferença de estilo entre os dois:
 *
 *  · UMA curva para a casa inteira, e nenhuma delas tem `ease-in`. As duas
 *    arrancam a fundo e travam no fim — a curva de uma coisa que já vinha a
 *    caminho. O que acelera devagar parece estar a decidir se vem.
 *  · DUAS velocidades e não uma escala: 0,1 s para cor, 0,3 s para forma.
 *    Nenhuma resposta a clique ou a rato passa dos 300 ms nos dois sites;
 *    acima disso deixa de parecer resposta e passa a parecer processamento.
 *  · Um DEGRAU de 20 ms para grupos, com tecto de seis. A Apple tem-no escrito
 *    no CSS: 0,20 / 0,22 / 0,24 / 0,26 / 0,28 / 0,30 s.
 *
 * O que este teste guarda é o TECTO, que é a parte que se perde primeiro. Sem
 * ele, uma lista de trinta linhas põe a última a entrar seis décimos de
 * segundo depois da primeira — e o desfasamento, que existe para o olho ler
 * ordem, passa a ler-se como lentidão.
 */

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("o movimento da casa", () => {
  it("tem uma curva para mudar de estado e outra para o que entra — e nenhuma com ease-in", () => {
    expect(CSS).toContain("--bo-curva: cubic-bezier(0.4, 0, 0.2, 1)");
    expect(CSS).toContain("--bo-curva-entra: cubic-bezier(0, 0, 0.5, 1)");
    // O primeiro par de cada curva é o que diz se há `ease-in`: com x1 = 0 e
    // y1 = 0 a curva arranca a fundo. Se alguém trocar isto por um `ease` ou um
    // `ease-in-out`, o teste não passa — e é essa a intenção.
    for (const curva of ["--bo-curva", "--bo-curva-entra"]) {
      const m = CSS.match(new RegExp(`${curva}: cubic-bezier\\(([^)]+)\\)`));
      expect(m, `${curva} deixou de ser uma cubic-bezier`).not.toBeNull();
      const [x1, y1] = m![1].split(",").map((n) => Number(n.trim()));
      expect(y1, `${curva} ganhou ease-in — arranca devagar e parece hesitante`).toBe(0);
      expect(
        x1,
        `${curva} arranca com x1 = ${x1}: acima de 0,4 já é hesitação`,
      ).toBeLessThanOrEqual(0.4);
    }
  });

  it("tem duas velocidades, e nenhuma passa dos 300 ms", () => {
    const tempos: Record<string, number> = {
      "--bo-t-cor": 0.1,
      "--bo-t-sinal": 0.2,
      "--bo-t-forma": 0.3,
    };
    for (const [nome, valor] of Object.entries(tempos)) {
      expect(CSS, `falta ${nome}`).toContain(`${nome}: ${valor}s`);
    }
  });

  it("e a escada de entrada tem degraus de 20 ms — e PÁRA ao sexto", () => {
    expect(CSS).toContain("--bo-degrau: 20ms");
    expect(CSS).toContain("--bo-degraus-max: 5");

    // O tecto tem de estar na conta do atraso, e não só declarado num token
    // que ninguém lê. Medido num browser antes de escrever isto:
    // `--cena: 0 → 0s`, `3 → 0,06s`, `5 → 0,1s`, `30 → 0,1s`.
    const bloco = CSS.slice(CSS.indexOf(".bo-cena {"));
    const atraso = bloco.slice(0, bloco.indexOf("}"));
    expect(
      atraso,
      "o atraso da cascata deixou de ter tecto — uma lista longa volta a entrar em câmara lenta",
    ).toMatch(/min\(var\(--cena, ?0\), ?var\(--bo-degraus-max\)\)/);
    expect(atraso).toContain("var(--bo-degrau)");
  });
});

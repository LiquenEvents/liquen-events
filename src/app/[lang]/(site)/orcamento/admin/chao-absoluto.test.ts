import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CHÃO QUE NÃO TEM LARGURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O chão do telemóvel (ver `escala-movel.test.ts`) levanta cinco tamanhos — 7 a
 * 11 px — e pára nos 1024, porque é aí que a lista passa a tabela e a tabela é
 * densa porque tem de ser. Essa fronteira está medida e continua a valer.
 *
 * Continua a valer para os 10 e 11 px. **Não vale para os 8 e 9.**
 *
 * Uma análise de craft mediu o CSS calculado da apple.com nó a nó: 208 blocos
 * de texto, oito degraus, e o mais baixo de todos é 12 px — num ecrã de
 * 1108 px, onde densidade não falta. A escala desta casa começa no mesmo sítio
 * (`--bo-fs-caption`). Nenhuma das duas desce abaixo disso em ecrã nenhum,
 * porque abaixo de 12 px não é texto denso: é texto que não se lê.
 *
 * Medido: 94 chamadas a `text-[8px]`/`text-[9px]` em 20 ficheiros do back
 * office, algumas a vestir etiquetas de estado e rótulos de destino.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** O bloco do chão absoluto — do título dele até ao comentário seguinte. */
function bloco(): string {
  const i = CSS.indexOf("CHÃO ABSOLUTO");
  expect(i, "o bloco do chão absoluto desapareceu do globals.css").toBeGreaterThan(-1);
  const resto = CSS.slice(i);
  const fim = resto.indexOf("/* ──", 200);
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe("o chão absoluto da letra", () => {
  it("levanta o 7, o 8 e o 9 ao degrau que a casa já tinha", () => {
    const b = bloco();
    for (const px of [7, 8, 9]) {
      expect(b, `o ${px}px ficou de fora`).toContain(`.text-\\[${px}px\\]`);
    }
    // O degrau da casa, e não um número inventado ao lado dele.
    expect(b).toMatch(/font-size:\s*var\(--bo-fs-caption\)/);
  });

  /**
   * A régua ao contrário, e é a que impede isto de virar o outro bloco: o 10 e
   * o 11 são o registo denso do computador. Levantá-los aqui mudava a densidade
   * da tabela sem ninguém pedir — que é precisamente o que o `escala-movel`
   * guarda, e com razão.
   */
  it("e NÃO levanta o 10 nem o 11 — esses são a densidade do computador", () => {
    const b = bloco();
    expect(b).not.toContain(".text-\\[10px\\]");
    expect(b).not.toContain(".text-\\[11px\\]");
  });

  it("não tem largura nenhuma — é um limite do olho, não do ecrã", () => {
    expect(bloco()).not.toMatch(/@media/);
  });

  it("é do back office e não pinta o site público", () => {
    expect(bloco()).toMatch(/body\.admin-mode/);
  });

  /**
   * A geometria que o bloco de cima já tinha aprendido: subir o corpo sem
   * desapertar o espacejamento troca letra pequena por texto transbordado.
   */
  it("desaperta o espacejamento junto com o tamanho", () => {
    expect(bloco()).toMatch(/letter-spacing:/);
  });

  /**
   * ── E O BLOCO DO TELEMÓVEL TEM DE CONTINUAR INTEIRO ────────────────────
   * O `escala-movel.test.ts` lê a regra dele a partir do título até ao
   * comentário seguinte. Pôr este bloco ANTES deixava-o a ler metade — e os
   * seis casos dele caíram todos à primeira tentativa, por isso.
   */
  it("vem depois do chão do telemóvel, e não antes", () => {
    const movel = CSS.indexOf("CHÃO DA LETRA NO TELEMÓVEL");
    const absoluto = CSS.indexOf("CHÃO ABSOLUTO");
    expect(movel).toBeGreaterThan(-1);
    expect(absoluto).toBeGreaterThan(movel);
    // E o `@media` do telemóvel fica entre os dois, que é o que prova que o
    // bloco dele não foi partido ao meio.
    expect(CSS.slice(movel, absoluto)).toMatch(/@media\s*\(max-width:\s*1023/);
  });
});

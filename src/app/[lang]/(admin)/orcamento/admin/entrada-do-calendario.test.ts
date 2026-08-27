import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CALENDÁRIO — O MÊS DIZ-SE NA LETRA DA CASA, E O ECRÃ MONTA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Passo 5 do redesenho. Este ecrã não tinha o problema dos outros — não são
 * treze blocos empilhados, e a grelha do mês é claramente o herói. Faltavam-lhe
 * duas coisas:
 *
 *  · o TÍTULO. «Agosto 2026» estava a 20/24 px, o mesmo degrau de um subtítulo
 *    qualquer. Num ecrã que se navega mês a mês, saber em que mês se está não
 *    pode ser letra miudinha — e é a única linha que o diz.
 *  · a ENTRADA, que aparecia toda de uma vez.
 *
 * ── PORQUE É QUE O TÍTULO TEM UM MÍNIMO E NÃO UM TAMANHO ─────────────────
 *
 * Porque este cabeçalho já se partiu uma vez por causa da largura: a 390 px,
 * «Agosto 2026» mostrava 90 dos 103 px de que precisa e lia-se «Agosto 2…». A
 * correcção da altura foi o `flex-wrap` com um mínimo legível — está escrita no
 * ficheiro. Um tamanho fixo grande reabria o mesmo buraco; o `clamp` sobe onde
 * há espaço e não força onde não há.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Calendario.tsx", "utf8");

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(FONTE);

describe("a entrada do Calendário", () => {
  it("o mês é dito na letra da casa e no degrau de display", () => {
    const i = CODIGO.indexOf("{MONTHS[month]} {year}");
    expect(i, "não encontrei o título do mês").toBeGreaterThan(-1);
    const cabecalho = CODIGO.slice(Math.max(0, i - 400), i);
    expect(cabecalho, "o título do mês perdeu a letra de display").toContain("font-display");
    const m = cabecalho.match(/clamp\(\s*(\d+)px\s*,[^,]+,\s*(\d+)px\s*\)/);
    expect(m, "o título do mês voltou a um degrau fixo do Tailwind").not.toBeNull();
    expect(
      Number(m![1]),
      "o mínimo do título desceu abaixo do degrau `lead`",
    ).toBeGreaterThanOrEqual(21);
  });

  it("o ecrã monta-se em cascata, e cada bloco tem a sua vez", () => {
    const v = [...CODIGO.matchAll(/"--cena":\s*(\d+)/g)].map((m) => Number(m[1]));
    expect(v.length, "o Calendário deixou de ser encenado").toBeGreaterThanOrEqual(2);
    expect(v.length - new Set(v).size, `blocos a partilhar a vez: ${v.join(", ")}`).toBe(0);
    const ord = [...v].sort((a, b) => a - b);
    expect(ord[0]).toBe(0);
    ord.forEach((n, i) => expect(n, `salto na cascata: ${ord.join(", ")}`).toBe(i));
  });

  it("o cabeçalho continua a poder quebrar — o defeito de «Agosto 2…»", () => {
    // Um título maior sem `flex-wrap` volta a cortar-se a meio num telemóvel.
    // A correcção antiga tem de sobreviver à nova.
    const i = CODIGO.indexOf("{MONTHS[month]} {year}");
    const cabecalho = CODIGO.slice(Math.max(0, i - 600), i);
    expect(cabecalho, "o cabeçalho do mês perdeu o `flex-wrap`").toContain("flex-wrap");
    expect(cabecalho, "o título perdeu a largura mínima que faz a quebra disparar").toMatch(
      /min-w-\[/,
    );
  });
});

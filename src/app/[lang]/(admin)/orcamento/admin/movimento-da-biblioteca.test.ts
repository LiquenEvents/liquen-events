import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM SÓ VOCABULÁRIO DE MOVIMENTO — FASE 7
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A casa tem uma escala de tempos escrita (`--duration-micro`,
 * `--duration-elemento`, `--duration-vista`, em globals.css) e a razão de ela
 * existir também está lá: antes havia seis números em uso — 300, 200, 500,
 * 700, 150, 400 — sem regra escrita em lado nenhum, ou seja cada componente
 * novo escolhia à sorte.
 *
 * Os ecrãs da Biblioteca tinham voltado a escolher à sorte: cinco barras de
 * progresso a 300 ms e duas passagens de opacidade a 200. Ninguém nota UMA
 * delas; o que se nota é o conjunto — duas coisas iguais a moverem-se a ritmos
 * diferentes lado a lado lêem-se como duas coisas diferentes.
 *
 * ── E A BARRA NÃO ANIMA A LARGURA ────────────────────────────────────────
 *
 * Mudar a largura obriga o navegador a refazer a linha a cada tique — e uma
 * barra de progresso tica cinco vezes por segundo, durante minutos, enquanto
 * 300 fotografias sobem. `transform` é composto sem repintar. Num portátil não
 * se vê; num telemóvel a meio de um carregamento, vê-se.
 *
 * Isto é um teste de FICHEIRO e não de comportamento, de propósito: o que se
 * está a prender não é o que um ecrã faz, é uma regra da casa que só vale
 * enquanto ninguém a esquecer — e esquecer-se-ia no próximo componente.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/** Os ecrãs da Biblioteca e do seletor — os que a Fase 7 cobre. */
const ECRAS = [
  "Temas.tsx",
  "ThemePicker.tsx",
  "BibliotecaRevisao.tsx",
  "FundirTemas.tsx",
  "ThemeCopyDialog.tsx",
  "PaginaEmConstrucao.tsx",
  "ImagemComPlanoB.tsx",
  "ui/EmCurso.tsx",
];

const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

describe("o movimento da Biblioteca fala uma língua só", () => {
  it("nenhum tempo fora da escala da casa", () => {
    const fora: string[] = [];
    for (const f of ECRAS) {
      for (const linha of ler(f).split("\n")) {
        // `duration-elemento` e companhia passam; `duration-300` e
        // `duration-[450ms]` não.
        const m = /\bduration-(\[?\d+m?s?\]?)/.exec(linha);
        if (m) fora.push(`${f}: duration-${m[1]}`);
      }
    }
    expect(fora, "usa `duration-micro`/`-elemento`/`-vista` — ver globals.css").toEqual([]);
  });

  /** Ver o cabeçalho: a largura obriga a refazer a linha a cada tique. */
  it("nenhuma barra de progresso anima a largura", () => {
    const larguras = ECRAS.filter((f) => ler(f).includes("transition-[width]"));
    expect(larguras, "anima `transform: scaleX` com `origin-left`").toEqual([]);
  });

  /**
   * Quem pediu menos movimento não fica sem informação: o que se tira é a
   * SUAVIZAÇÃO, não a barra. Por isso as transições são todas `motion-safe:`
   * — e uma que não seja é uma que fica a mexer contra a vontade dela.
   */
  it("todas as transições respeitam quem pediu menos movimento", () => {
    const soltas: string[] = [];
    for (const f of ECRAS) {
      for (const linha of ler(f).split("\n")) {
        // `transition-colors` é uma mudança de cor sem deslocação: não é
        // movimento, e é a única que passa sem guarda.
        const cru = /(?<!motion-safe:)\btransition-(transform|opacity|\[)/.exec(linha);
        if (cru) soltas.push(`${f}: ${cru[0]}`);
      }
    }
    expect(soltas, "prefixa com `motion-safe:`").toEqual([]);
  });
});

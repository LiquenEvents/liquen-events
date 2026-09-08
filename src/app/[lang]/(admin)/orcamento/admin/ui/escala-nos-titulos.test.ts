import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TÍTULOS USAM A ESCALA — E O PESO CONTINUA A SER O QUE ELA PEDIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 02 do `docs/DESIGN-SYSTEM.md`. O mapeamento fixo dá `title1` ao título
 * de página e `title3` ao título de secção, e diz uma coisa que se perde
 * facilmente: **o leading da escala é ABSOLUTO**, «nunca uses `line-height`
 * unitless nesta escala».
 *
 * Um `leading-tight` ao lado de um `text-title1` não dá erro nenhum — apaga
 * silenciosamente a entrelinha que a escala traz e devolve um rácio. O
 * tamanho fica certo, a entrelinha fica errada, e ninguém vê a diferença até
 * um título quebrar em duas linhas.
 *
 * ── E O PESO, QUE É ONDE O DOCUMENTO PERDE ───────────────────────────────
 *
 * O mapeamento pede `/600`. Não se faz, e isto guarda o não-fazer.
 *
 * Há uma instrução dela, anterior e mais específica, escrita no `globals.css`
 * com as palavras dela: foi ver qual era a letra que queria no back office,
 * trouxe o nome — Geist, a da Vercel — e descreveu-a como «tracking negativo
 * forte nos títulos e PESO NORMAL em vez de negrito». Um documento geral não
 * desfaz uma instrução dela sobre o caso exacto; o que a escala traz é
 * precisamente a metade que ela pediu, o aperto, e essa entra.
 *
 * Sem este teste, o próximo a ler o mapeamento acrescenta o `font-semibold`
 * de boa fé e desfaz uma decisão dela que ninguém volta a ver escrita.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ui");
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

/** Sem comentários: nesta casa a prosa que explica é maior do que o código. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");

const PAGINA = semComentarios(ler("PageHeader.tsx"));
const CARTAO = semComentarios(ler("Card.tsx"));

describe("os títulos do back office usam a escala do sistema", () => {
  it("o título de página é `title1`, e cresce para `display` a partir de 640", () => {
    expect(PAGINA, "o título de página saiu da escala").toMatch(/text-title1/);
    // Os dois tamanhos são, ao milímetro, os que lá estavam (24 e 30 px) — a
    // conta de altura do cabeçalho continua a valer.
    expect(PAGINA, "o degrau grande do título de página desapareceu").toMatch(/sm:text-display/);
  });

  it("o título de secção é `title3`", () => {
    expect(CARTAO, "o título de painel saiu da escala").toMatch(/text-title3/);
  });

  /**
   * O que a escala traz por cima do tamanho é a entrelinha em píxeis e o
   * aperto. Um rácio ao lado apaga o primeiro.
   */
  it.each([
    ["o cabeçalho de página", () => PAGINA],
    ["o cartão", () => CARTAO],
  ])("e %s não põe um rácio de entrelinha por cima dela", (_nome, fonte) => {
    expect(
      fonte(),
      "um `leading-*` ao lado da escala apaga a entrelinha absoluta que ela traz",
    ).not.toMatch(/leading-(tight|snug|normal|relaxed|loose)/);
  });

  /**
   * ── O PESO NORMAL, QUE É UMA DECISÃO DELA ──────────────────────────────
   * Ver o cabeçalho. Se um dia ela mudar de ideias, muda-se aqui e no
   * `globals.css`, com as palavras novas ao lado das antigas.
   */
  it.each([
    ["o título de página", () => PAGINA, /text-title1[^"]*font-(semibold|bold)/],
    ["o título de secção", () => CARTAO, /text-title3[^"]*font-(semibold|bold)/],
  ])("%s continua em peso normal, como ela pediu", (_nome, fonte, pesado) => {
    expect(
      fonte(),
      "o título ganhou negrito — ela pediu «peso normal em vez de negrito» (ver `globals.css`)",
    ).not.toMatch(pesado);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COREOGRAFIA DA LUPA NÃO PODE SAIR DAS DUAS PROPRIEDADES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lupa aparecia. Passa a NASCER da miniatura em que o dedo tocou — o mundo
 * escurece à volta, e a fotografia cresce daquele rectângulo.
 *
 * MEDIDO num Chromium a 390×780, DPR 3, com a conta real: em cinco formas de
 * fotografia (3/2, 3/4, 4/3, 16/9, 2/3) o primeiro fotograma do voo TAPA a
 * miniatura, centrado, com desvio de 0,00 px. É o mesmo recorte que a grelha
 * mostra — por isso se lê «é aquela» e não «apareceu uma coisa».
 *
 * ── PORQUE É QUE ISTO É UM TESTE DE REGRA E NÃO DE NÚMEROS ────────────────
 *
 * Os 60 fps têm uma condição e uma só: só se animam `transform` e `opacity`.
 * Uma `width`, um `filter` ou um `top` num destes fotogramas põem a página a
 * recalcular posições sessenta vezes por segundo, e a queixa dela volta a ser
 * a de sempre — «trava ao deslizar». O próximo que acrescentar um fotograma à
 * lupa é apanhado aqui, mesmo que o fotograma pareça inofensivo.
 */
const CSS = readFileSync("src/app/globals.css", "utf8");
const FONTE = readFileSync("src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx", "utf8");

/** Todos os `@keyframes lupa-*`, com o corpo. */
function fotogramasDaLupa(): { nome: string; corpo: string }[] {
  return [...CSS.matchAll(/@keyframes\s+(lupa-[\w-]+)\s*\{([\s\S]*?)\n\}/g)].map((m) => ({
    nome: m[1],
    corpo: m[2],
  }));
}

describe("a coreografia da lupa", () => {
  it("CONTROLO: os fotogramas existem mesmo", () => {
    // Sem isto, um nome mudado dava lista vazia e tudo o que vem a seguir
    // passava por vacuidade — o pior resultado possível numa rede.
    expect(
      fotogramasDaLupa()
        .map((f) => f.nome)
        .sort(),
      "os `@keyframes lupa-*` desapareceram, ou mudaram de nome",
    ).toEqual(["lupa-aparece", "lupa-nasce"]);
  });

  it("só anima `transform` e `opacity` — mais nada", () => {
    for (const { nome, corpo } of fotogramasDaLupa()) {
      const propriedades = [...corpo.matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
      expect(propriedades.length, `${nome} não declara nada`).toBeGreaterThan(0);
      for (const p of propriedades) {
        expect(
          ["transform", "opacity"],
          `${nome} passou a animar \`${p}\` — deixa de ser trabalho de compositor ` +
            "e põe a página a recalcular posições a cada fotograma",
        ).toContain(p);
      }
    }
  });

  it("toda ela está atrás de `prefers-reduced-motion: no-preference`", () => {
    /**
     * Não basta desligar dentro de um `reduce`: quem pediu menos movimento não
     * pode sequer ter a animação declarada.
     */
    const semNoPreference = CSS.replace(
      /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g,
      "",
    );
    for (const classe of ["lupa-nasce", "lupa-veu", "lupa-pecas"]) {
      expect(
        new RegExp(`\\.${classe} \\{[^}]*animation`).test(semNoPreference),
        `a \`.${classe}\` saiu de dentro do \`no-preference\``,
      ).toBe(false);
    }
  });

  it("o repouso é sempre visível — nenhuma acaba escondida nem fora do sítio", () => {
    /**
     * A regra que manda em tudo: um repouso invisível faz da animação a
     * CONDIÇÃO de o conteúdo existir, e essa é a maneira de servir a um casal
     * um documento de vinte mil euros em branco.
     */
    const porNome = Object.fromEntries(fotogramasDaLupa().map((f) => [f.nome, f.corpo]));
    expect(porNome["lupa-nasce"]).toMatch(/to\s*\{[^}]*transform:\s*none/);
    expect(porNome["lupa-aparece"]).toMatch(/to\s*\{[^}]*opacity:\s*1/);
    for (const classe of ["lupa-nasce", "lupa-veu", "lupa-pecas"]) {
      const regra = new RegExp(`\\.${classe} \\{[^}]*\\}`).exec(CSS)?.[0] ?? "";
      expect(regra, `desapareceu a regra da \`.${classe}\``).not.toBe("");
      expect(
        regra,
        `a \`.${classe}\` passou a `.concat("`forwards`, que prende o fim"),
      ).not.toContain("forwards");
      expect(regra, `a \`.${classe}\` deixou de usar `.concat("`backwards`")).toContain(
        "backwards",
      );
    }
  });

  it("o que cresce é a MOLDURA, e nunca o diálogo", () => {
    /**
     * A `lupa-nasce` toca em `transform`, e um `transform` faz do elemento o
     * bloco de contenção de qualquer `position: fixed` lá dentro. No diálogo,
     * isso repetiria a avaria que já custou uma lupa a medir 3202 px num ecrã
     * de 780 — ver `nada-fixo-preso-numa-seccao.test.ts`.
     */
    expect(FONTE, "a moldura deixou de ser quem recebe o voo").toMatch(
      /caixa\.classList\.add\("lupa-nasce"\)/,
    );
    /**
     * E a classe NUNCA aparece numa `className` do desenho — nem no diálogo nem
     * em lado nenhum. Só o `classList.add` a põe, depois de as três variáveis
     * estarem escritas: posta no desenho, a animação arrancava com os valores
     * por omissão e via-os mudar a meio, que é um salto.
     */
    const semComentarios = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const emClassName = [...semComentarios.matchAll(/className=\{?["`][^"`]*["`]/g)]
      .map((m) => m[0])
      .filter((s) => s.includes("lupa-nasce"));
    expect(
      emClassName,
      "a `lupa-nasce` passou a ser desenhada numa `className` — arranca antes de a conta existir",
    ).toEqual([]);
  });

  it("o voo não parte de uma forma inventada", () => {
    /**
     * Uma fotografia anterior às colunas de dimensão não tem forma conhecida. A
     * GRELHA reserva-lhe três por dois e recorta; a lupa é `object-contain`, e
     * a caixa de uma forma inventada é a caixa errada — a fotografia crescia
     * para um sítio e saltava para outro quando o original chegasse.
     */
    expect(FONTE, "a `forma` da lupa deixou de estar presa às medidas guardadas").toMatch(
      /const forma =\s*foto\?\.largura && foto\?\.altura/,
    );
  });

  it("e não voa quando não consegue medir — aí a lupa aparece, como aparecia", () => {
    /**
     * Devolver `false` não é uma falha: é a decisão de não voar. Uma miniatura
     * que já saiu do ecrã (depois de três setas dentro do board), uma caixa a
     * zero, um browser que não meça — em qualquer desses casos não se
     * acrescenta classe nenhuma, e o que se vê é o que se via antes disto
     * existir. Nunca um salto.
     */
    const conta = /function marcarVoo\([\s\S]*?\n\}/.exec(FONTE)?.[0] ?? "";
    expect(conta, "desapareceu a conta do voo").not.toBe("");
    expect(conta, "deixou de recusar uma caixa a zero").toMatch(/width <= 0/);
    expect(conta, "deixou de recusar uma miniatura fora do ecrã").toMatch(/window\.innerHeight/);
    expect(
      conta,
      "passou a usar `min` — com `min` sobra papel à volta e a fotografia salta de tamanho",
    ).toMatch(/Math\.max\(/);
  });
});

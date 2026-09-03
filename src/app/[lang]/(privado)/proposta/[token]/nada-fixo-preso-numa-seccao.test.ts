import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NADA `position: fixed` PODE FICAR PRESO DENTRO DE UMA SECÇÃO DA PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Toda a secção do documento leva `prop-chega` (ver `Documento.tsx`), a
 * animação que a faz subir ao entrar no ecrã. E uma animação que toque em
 * `transform` faz do elemento o BLOCO DE CONTENÇÃO de qualquer
 * `position: fixed` lá dentro — que deixa de ser medido pelo ecrã e passa a
 * ser medido pela secção.
 *
 * ── A REGRA, MEDIDA, E NÃO A QUE SE SUPÕE ─────────────────────────────────
 *
 * Isto já custou uma lupa de fotografias que não tapava o ecrã: num Chromium a
 * 390×780 o diálogo media de 270 a 3202 px num ecrã de 0 a 780. O casal
 * carregava numa fotografia e via meio ecrã preto com a fotografia fora dele.
 *
 * A explicação que se escreveu na altura culpava o `animation-fill-mode: both`
 * — que deixa um `translateY(0)` calculado no fim. Está errada, e foi medida
 * outra vez, com sete variantes e uma lupa `fixed` dentro de cada:
 *
 *   both                      transform calculado: matrix(1,0,0,1,0,0)  presa
 *   backwards                 transform calculado: none                 PRESA
 *   fill: none                transform calculado: none                 PRESA
 *   só a linha de tempo       transform calculado: none                 livre
 *   both, mas anima opacity   transform calculado: none                 livre
 *   nada                      transform calculado: none                 livre
 *
 * Com o `transform` calculado a dizer `none`, a lupa CONTINUA presa (linhas 2
 * e 3). A animar a opacidade, com o mesmo `both`, fica livre (linha 5).
 *
 * BASTA A ANIMAÇÃO TOCAR EM `transform`. O preenchimento não tem nada a ver
 * com isto, e trocá-lo seria um placebo.
 *
 * ── LOGO, O PORTAL NÃO É UM REMENDO: É O ÚNICO CAMINHO ────────────────────
 *
 * Não há maneira de a secção deixar de conter o que está lá dentro sem lhe
 * tirar a animação — que é precisamente o que ela quer ter. Qualquer coisa
 * `fixed` no documento tem de sair para o `<body>` por um portal.
 *
 * Este caso guarda a REGRA e não uma instância: apanha o PRÓXIMO elemento fixo
 * que alguém acrescentar sem portal, que é o defeito que ainda não aconteceu.
 */
const PASTA = "src/app/[lang]/(privado)/proposta/[token]";

/** O código sem comentários — senão esta própria explicação dispararia o teste. */
function codigoDe(ficheiro: string): string {
  return readFileSync(join(PASTA, ficheiro), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

const COMPONENTES = readdirSync(PASTA).filter((f) => f.endsWith(".tsx") && !f.includes(".test."));

describe("nada fixo fica preso numa secção da proposta", () => {
  it("todo o componente com um elemento `fixed` sai por um portal", () => {
    const presos: string[] = [];
    for (const ficheiro of COMPONENTES) {
      const codigo = codigoDe(ficheiro);
      // A classe do Tailwind, tal como aparece num `className`: ou sozinha
      // entre aspas, ou rodeada de espaços no meio de uma lista.
      const temFixo = /(["'`\s])fixed[\s"'`]/.test(codigo);
      if (temFixo && !codigo.includes("createPortal")) presos.push(ficheiro);
    }
    expect(
      presos,
      "um elemento `fixed` dentro de uma secção com `prop-chega` é medido pela " +
        "SECÇÃO e não pelo ecrã — tem de sair para o `<body>` por um portal",
    ).toEqual([]);
  });

  it("CONTROLO: o varredor reconhece mesmo um elemento fixo", () => {
    /**
     * Sem isto, uma expressão que não casasse com nada dava lista vazia e o
     * caso acima passava por vacuidade — o pior resultado possível numa rede.
     */
    const comFixo = COMPONENTES.filter((f) => /(["'`\s])fixed[\s"'`]/.test(codigoDe(f)));
    expect(
      comFixo.length,
      "o varredor deixou de encontrar qualquer elemento fixo — ou eles " +
        "desapareceram, ou a expressão deixou de casar e esta rede é decorativa",
    ).toBeGreaterThan(0);
  });

  it("e a secção continua mesmo a animar o `transform` — é isso que a torna perigosa", () => {
    // Se um dia o `prop-chega` deixar de tocar em `transform`, a regra acima
    // deixa de ser necessária — e quem a ler tem de o saber pelo teste, não
    // por adivinhação.
    const css = readFileSync("src/app/globals.css", "utf8");
    const fotogramas = /@keyframes prop-chega \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(fotogramas, "os fotogramas do `prop-chega` desapareceram").not.toBe("");
    expect(fotogramas).toMatch(/transform:/);
  });
});

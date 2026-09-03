import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CSS DO BACK OFFICE NÃO VIAJA NA PROPOSTA — E O BACK OFFICE NÃO FICA NU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «umas vezes abre bem, outras vezes não abre bem, eu quero que
 * abra sempre bem». A animação já era idêntica em todo o lado — o que variava
 * era o ECRÃ BRANCO antes dela. A cortina estava no byte 234.610 de 495.756 do
 * documento, e o CSS, que vive no `<head>`, trava a primeira pintura.
 *
 * 87,8 KB dessa folha (32%) eram utilitários que só o back office usa. Saíram.
 * Medido em 4G fraca: proposta 596 ms → 488 ms, sítio 628 ms → 496 ms.
 *
 * ── PORQUE É QUE ESTE TESTE GERA CSS EM VEZ DE LER DIRECTIVAS ─────────────
 *
 * Porque a primeira versão dele lia as directivas, dava verde, e o back office
 * estava SEM ESTILOS NENHUNS.
 *
 * O `admin.css` ia buscar o tema com `@reference "./globals.css"`. Só que um
 * `@reference` traz tudo o que o ficheiro referido tem — incluindo o
 * `@source not "./[lang]/(admin)"` —, e essa exclusão é ABSOLUTA: vence o
 * `source()` do próprio import e qualquer `@source` posterior. O `admin.css`
 * gerava 84 bytes: duas linhas de cabeçalho e um `@layer utilities` vazio.
 *
 * Nada disto dá erro. O build passa, a suite passa, o CI fica verde. Só o
 * painel dela é que aparece em branco — e ela é a única pessoa que o abre.
 *
 * Um teste que lê ficheiros não podia apanhar isto. Este gera as duas folhas
 * com o Tailwind e compara-as, que é a única pergunta que interessa: as
 * classes continuam todas a existir nalgum lado?
 *
 * ── E PORQUE É QUE O TEMA VIVE SOZINHO ────────────────────────────────────
 *
 * O `tema.css` existe por causa desta avaria: o `admin.css` precisa do tema
 * mas NÃO pode herdar a exclusão. Refere o `tailwindcss` (para o tema base,
 * sem o qual não sabe gerar um `-mt-1`) e o `tema.css` (para as cores da
 * casa), e nenhum dos dois exclui nada.
 */
/**
 * Gera a folha com o MESMO plugin que o `next build` usa (ver o
 * `postcss.config.mjs`) — não com uma ferramenta parecida. Se o que corre aqui
 * não for o que corre na compilação, este teste não vale nada.
 */
async function gerar(entrada: string): Promise<string> {
  const { default: postcss } = await import("postcss");
  const { default: tailwind } = await import("@tailwindcss/postcss");
  const r = await postcss([tailwind({ optimize: false })]).process(readFileSync(entrada, "utf8"), {
    from: entrada,
  });
  return r.css;
}

/** Os nomes de classe de uma folha, com os escapes do Tailwind desfeitos. */
function classesDe(css: string): Set<string> {
  const nomes = new Set<string>();
  for (const bloco of css.matchAll(/([^{}]+)\{/g)) {
    for (const c of bloco[1].matchAll(/\.((?:[\w-]|\\.)+)/g)) {
      nomes.add(c[1].replace(/\\(.)/g, "$1"));
    }
  }
  return nomes;
}

const doSitio = await gerar("src/app/globals.css");
const doBackOffice = await gerar("src/app/admin.css");

describe("o back office não viaja dentro da proposta", () => {
  it("o globals.css deixou mesmo de gerar o que só o back office usa", () => {
    const n = classesDe(doSitio).size;
    expect(n, "a folha do sítio ficou vazia — algo se partiu na geração").toBeGreaterThan(1000);
    expect(
      doSitio.length,
      `a folha do sítio tem ${doSitio.length} bytes; antes da separação eram muito mais. ` +
        "Se voltou a esse tamanho, o `@source not` deixou de fazer efeito.",
    ).toBeLessThan(240_000);
  });

  it("e o admin.css gera mesmo alguma coisa — não um invólucro vazio", () => {
    /**
     * A asserção que faltava. Com o `@reference` a apontar para uma folha que
     * exclui a pasta `(admin)`, isto dava 84 bytes e ninguém dava por nada.
     */
    expect(
      doBackOffice.length,
      `o admin.css gerou ${doBackOffice.length} bytes. Abaixo de 50 KB é um ` +
        "invólucro vazio, e o painel dela abre sem estilos nenhuns.",
    ).toBeGreaterThan(60_000);
  });

  it("as classes que o back office usa existem — e é o admin.css que as traz", () => {
    const sitio = classesDe(doSitio);
    const backOffice = classesDe(doBackOffice);
    const soDele = [...backOffice].filter((c) => !sitio.has(c));
    expect(
      soDele.length,
      "o admin.css deixou de acrescentar seja o que for ao que o sítio já tinha",
    ).toBeGreaterThan(500);

    /**
     * ── PORQUE É QUE AQUI NÃO HÁ UMA AMOSTRA DE CLASSES ────────────────────
     *
     * Porque não pode haver. O Tailwind varre os ficheiros `.ts`, e este é um
     * deles: escrever aqui `"top-[132px]"` como exemplo FAZ NASCER essa classe
     * na folha do sítio, e a asserção «esta classe não viaja na proposta»
     * passa a mentir por causa de si própria. Apanhei isto com uma diferença
     * de 80 bytes entre gerar a folha aqui dentro e gerá-la fora.
     *
     * O que fica são duas contagens, que não se contaminam: a folha do sítio
     * tem de ter encolhido, e a do back office tem de acrescentar centenas de
     * classes que a outra não tem.
     */
  });

  it("o tema vive sozinho, e o admin.css não o vai buscar à folha que exclui", () => {
    const admin = readFileSync("src/app/admin.css", "utf8");
    expect(admin, "voltou a herdar a exclusão — é o que o punha a gerar 84 bytes").not.toMatch(
      /@reference\s+"\.\/globals\.css"/,
    );
    expect(admin).toMatch(/@reference\s+"\.\/tema\.css"/);
    expect(admin, "sem o tema base não sabe gerar um `-mt-1`").toMatch(/@reference\s+"tailwindcss"/);
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/@import\s+"\.\/tema\.css"/);
  });

  it("só o layout do back office carrega a folha dele", () => {
    expect(readFileSync("src/app/[lang]/(admin)/layout.tsx", "utf8")).toContain("admin.css");
    for (const [onde, caminho] of [
      ["a proposta", "src/app/[lang]/(privado)/layout.tsx"],
      ["o sítio", "src/components/CromadoDoSitio.tsx"],
    ] as const) {
      expect(
        readFileSync(caminho, "utf8"),
        `${onde} passou a carregar o CSS do back office`,
      ).not.toContain("admin.css");
    }
  });
});

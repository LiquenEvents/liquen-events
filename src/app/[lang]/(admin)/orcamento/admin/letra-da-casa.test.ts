import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LETRA DA CASA NO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para o deploy verdadeiro: «o back office está com a
 * mesma estrutura, não me diz nada — eu gostava de o levar ao nível da Apple e
 * da Pixelmatters».
 *
 * Uma das razões era uma linha de CSS. O bloco do back office redefinia
 * `--font-playfair` para o Inter, de propósito, para um ar «calm ChatGPT-app».
 * Resultado: os 38 sítios que pedem a letra de DISPLAY — títulos de página,
 * nome do casal, números do dinheiro — pediam-na e recebiam a mesma sans do
 * resto da interface. O back office ficou sem cara nenhuma, e era a única
 * página da Líquen sem a letra da Líquen.
 *
 * ── AS DUAS COISAS QUE ESTE FICHEIRO GUARDA ───────────────────────────────
 *
 * 1. Que a redefinição não volta. É uma linha, é fácil de repor «para
 *    uniformizar», e o efeito não dá erro nenhum — só apaga a identidade.
 *
 * 2. A FRONTEIRA DOS 16 px, que é a parte que se parte sozinha. O Playfair tem
 *    altura-de-x baixa: a 14 px lê-se como um Inter de 12,5, e o chão desta
 *    casa são 12 (ver o bloco «CHÃO DA LETRA» no `globals.css`). Um
 *    `font-display` numa legenda pequena não parte nada, não avisa, e põe texto
 *    por baixo do chão. Foi assim que a Biblioteca de Temas tinha uma descrição
 *    de 14 px em display — prosa vestida de título.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";

/** Comentários fora, com as linhas de pé — a lição já custou seis testes. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** Os `.tsx` do back office que não são testes. */
function ficheiros(): string[] {
  return execSync(`grep -rl "font-display" --include=*.tsx "${RAIZ}" || true`, { encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes(".test."));
}

describe("a letra da casa no back office", () => {
  it("o back office deixou de trocar o Playfair por Inter", () => {
    const css = semComentarios(CSS);
    // A redefinição vivia dentro do bloco do back office. Se voltar, volta
    // exactamente assim: `--font-playfair:` seguido de `var(--font-inter)`.
    expect(css, "alguém repôs a redefinição de `--font-playfair` para o Inter").not.toMatch(
      /--font-playfair:\s*\n?\s*var\(--font-inter\)/,
    );
  });

  it("o texto de trabalho continua todo em Inter", () => {
    // O que se devolveu foi a letra de DISPLAY. A `font-family` da raiz do
    // back office não se toca — se um dia ela também virar serifa, o ecrã de
    // trabalho fica ilegível numa densidade que é para ser lida de relance.
    const css = semComentarios(CSS);
    const i = css.indexOf("body.admin-mode,");
    const bloco = css.slice(i >= 0 ? i : 0, (i >= 0 ? i : 0) + 4000);
    expect(bloco).toMatch(/font-family:\s*\n?\s*var\(--font-inter\)/);
  });

  it("nenhum `font-display` desce abaixo dos 16 px", () => {
    // O Playfair a 14 px lê-se como um Inter de 12,5, e o chão da casa são 12.
    const proibidos = /text-\[(?:[0-9]|1[0-5])(?:\.\d+)?px\]|text-xs\b|text-sm\b/;
    const faltas: string[] = [];
    for (const f of ficheiros()) {
      const linhas = semComentarios(readFileSync(f, "utf8")).split("\n");
      linhas.forEach((l, n) => {
        if (!l.includes("font-display")) return;
        if (proibidos.test(l)) faltas.push(`${f}:${n + 1}`);
      });
    }
    expect(
      faltas,
      `\`font-display\` com letra abaixo de 16 px em:\n  ${faltas.join("\n  ")}`,
    ).toEqual([]);
  });

  it("e há mesmo sítios a pedir a letra de display — senão isto não guarda nada", () => {
    // O controlo positivo. Se um dia alguém tirar o `font-display` de todo o
    // lado, o caso de cima passa por não haver nada que ele possa reprovar.
    expect(ficheiros().length).toBeGreaterThan(5);
  });
});

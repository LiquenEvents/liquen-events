import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O FUNDO DO VISUALIZADOR NUNCA PODE FICAR TRANSPARENTE.
 *
 * O fundo com a cor da fotografia (GAL-3) é um degradé feito com
 * `color-mix()`. Um browser que não conheça essa função deita fora a
 * declaração INTEIRA em que ela aparece — e quando o degradé era a única
 * coisa no `background`, o fundo ficava transparente e a grelha via-se por
 * trás da foto aberta. Ela viu-o assim, num browser real, no dia em que
 * entrou.
 *
 * A regra que isto prende: o preto vem numa declaração própria, sem
 * `color-mix()`, e o degradé fica numa outra, por cima.
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** As declarações da regra `.lb-backdrop { … }` (a primeira, fora de media queries). */
function regraDoFundo(): string {
  const m = /\n\.lb-backdrop \{([^}]*)\}/.exec(css);
  expect(m, "a regra .lb-backdrop existe no globals.css").not.toBeNull();
  return m![1];
}

describe("o fundo do visualizador", () => {
  it("tem um preto opaco numa declaração própria, sem color-mix()", () => {
    const decls = regraDoFundo()
      .split(";")
      .map((d) => d.replace(/\/\*[\s\S]*?\*\//g, "").trim());
    const cor = decls.find((d) => d.startsWith("background-color:"));
    expect(cor, "há um background-color").toBeDefined();
    expect(cor).toMatch(/background-color:\s*(black|#000(000)?)$/);
  });

  it("e o degradé com a cor da foto não está no atalho `background`, que o apagaria", () => {
    const semComentarios = regraDoFundo().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(semComentarios).not.toMatch(/(^|[\s;])background:/);
    expect(semComentarios).toMatch(/background-image:\s*radial-gradient\(/);
  });
});

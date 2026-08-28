import { describe, it, expect } from "vitest";
import { comDistintivo } from "./harness";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PADRÃO QUE PROCURA UM DESTINO TEM DE O ENCONTRAR COM TRABALHO À ESPERA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ajudante não tinha onde ser posto à prova — o `e2e/` estava fora do
 * vitest — e foi por isso que um espaço lhe passou despercebido.
 *
 * O nome acessível do botão de um destino traz a contagem atrás, e o browser
 * mete um espaço ANTES da vírgula porque o distintivo é um nó irmão. MEDIDO,
 * a 1280, com 54 pedidos por responder:
 *
 *     button "Pedidos , 54 por responder"
 *
 * Com a vírgula colada o localizador nunca resolvia — e o que se via de fora
 * não era «não encontrei»: era o passeio pendurado três minutos e depois um
 * «Timeout» que não dizia de quê.
 */
describe("o padrão que encontra um destino do painel", () => {
  const casa = (rotulo: RegExp, nome: string) => comDistintivo(rotulo).test(nome);

  it("encontra o destino sem distintivo nenhum", () => {
    expect(casa(/^Pedidos$/, "Pedidos")).toBe(true);
  });

  it("encontra-o com o distintivo E o espaço que o browser mete", () => {
    // Esta é a linha que caía. O nome vem da árvore de acessibilidade, tal e
    // qual — não é inventado.
    expect(casa(/^Pedidos$/, "Pedidos , 54 por responder")).toBe(true);
  });

  it("encontra-o também sem o espaço, se algum dia o distintivo mudar de forma", () => {
    expect(casa(/^Pedidos$/, "Pedidos, 9 por responder")).toBe(true);
  });

  it("NÃO confunde um destino com outro que comece pelo mesmo nome", () => {
    // A metade que não se pode perder: sem ela, «Propostas» abria «Propostas
    // Aceites» e o passeio media a vista errada a dizer que estava tudo bem.
    expect(casa(/^Propostas$/, "Propostas Aceites")).toBe(false);
  });

  it("deixa em paz um padrão que não termina em `$`", () => {
    const solto = /Pedidos/;
    expect(comDistintivo(solto).source).toBe(solto.source);
  });
});

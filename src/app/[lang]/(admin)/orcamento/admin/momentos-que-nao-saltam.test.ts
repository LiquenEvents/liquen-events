import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DOIS MOMENTOS QUE SE VIAM SALTAR TODOS OS DIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra».
 *
 * Nem tudo o que muda de estado é uma vista a chegar. Estes dois não são — e
 * eram os dois saltos mais vistos do back office.
 *
 * 1. **O recibo do desfecho.** «Marcado como ganho — 4.600 €» é o fim de um
 *    percurso que começou num pedido e passou por uma proposta inteira.
 *    Aparecia num fotograma, no lugar onde estavam os botões.
 *
 * 2. **O botão «Guardar tudo».** Passa de pílula verde a caixa cinzenta com
 *    canto diferente, no cabeçalho, várias vezes por hora. O `ESTADO` já dava
 *    transição às cores, mas a lista dele é FECHADA de propósito e não tem
 *    `border-radius`: as cores deslizavam e o canto saltava, no mesmo elemento
 *    e no mesmo instante.
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO ───────────────────────────────
 *
 * Prende que o gesto existe e que é o da casa. Não prende que se veja — isso é
 * o browser. E prende, com nome, o que NÃO deve levar entrada: o painel do
 * valor combinado tem `autoFocus`, e uma entrada ali arrastava o campo quatro
 * píxeis debaixo do cursor que já lá está. É a armadilha mais fácil de cair
 * quando alguém decide «acabar o trabalho» e animar o painel todo.
 */

const DESFECHO = readFileSync(
  "src/app/[lang]/(admin)/orcamento/admin/PerguntaDeDesfecho.tsx",
  "utf8",
);
const GUARDAR = readFileSync("src/app/[lang]/(admin)/orcamento/admin/GuardarTudo.tsx", "utf8");
const CSS = readFileSync("src/app/globals.css", "utf8");

describe("dois momentos que não saltam", () => {
  it("o recibo do desfecho aparece de algum sítio", () => {
    expect(DESFECHO).toMatch(/fase\.tipo === "marcado" \? \(/);
    expect(DESFECHO).toMatch(/<div className="bo-entrada flex flex-col gap-2">/);
  });

  /**
   * O controlo que dá sentido ao de cima: o painel com `autoFocus` continua SEM
   * entrada. Se alguém lha puser, o campo passa a mexer-se debaixo do cursor.
   */
  it("o painel do valor combinado, que tem `autoFocus`, continua sem entrada", () => {
    const painel = DESFECHO.slice(DESFECHO.indexOf('fase.tipo === "quanto"'));
    const ate = painel.slice(0, painel.indexOf("autoFocus"));
    expect(ate).not.toMatch(/bo-entrada|bo-cena|view-in/);
  });

  it("o botão «Guardar tudo» muda de forma com a mesma cadência da cor", () => {
    // Os 120 ms são os do `ESTADO`, para as duas coisas chegarem juntas.
    expect(GUARDAR).toMatch(
      /motion-safe:transition-\[border-radius\] motion-safe:duration-\[120ms\]/,
    );
    // Controlo positivo: as cores continuam a vir do `ESTADO` da casa — se
    // alguém as trocar por um número à mão, as duas voltam a discordar.
    expect(GUARDAR).toMatch(/\$\{ESTADO\}/);
  });

  it("a `.bo-entrada` continua a ser 240 ms e a calar-se com movimento reduzido", () => {
    expect(CSS).toMatch(/\.bo-entrada\s*\{\s*animation:\s*bo-entrada\s+240ms/);
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.bo-entrada\s*\{\s*animation:\s*none/,
    );
  });
});

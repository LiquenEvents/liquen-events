import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PASSO QUE CHEGA APRESENTA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «imagina, estamos na fazer proposta, passamos para a parte
 * seguinte — o que é que metes de animação aí?».
 *
 * Até aqui, nada. Os três passos do estúdio — «1 Conteúdo», «2 Pré-visualizar»,
 * «3 Enviar» — trocavam com `hidden`: o conteúdo seguinte aparecia no mesmo
 * fotograma em que o anterior desaparecia. É o gesto mais repetido de uma tarde
 * a escrever propostas, e era o único ecrã grande do back office sem uma classe
 * de movimento (o `ProposalStudio.tsx` tinha ZERO ocorrências de `bo-cena`,
 * `view-in` ou `bo-entrada` em treze mil linhas).
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO PRENDE ────────────────────────
 *
 * Prende o MECANISMO, que é a parte que se pode partir sem ninguém dar por
 * isso: a `.view-in` entra e sai com o passo, em vez de vir de um `key`.
 *
 * A diferença não é de estilo. Um `key` remonta, e estes dois passos não podem
 * remontar: ficam montados de propósito (só `hidden`) porque o passo 1 guarda o
 * formulário inteiro e o passo 3 guarda o estado do envio. Alguém que troque
 * isto por `key={step}` a pensar que é a mesma coisa faz o estúdio perder o
 * foco, o rolo e o trabalho a meio — e o ecrã continua a animar, portanto o
 * defeito passa despercebido.
 *
 * Não prende que a animação SE VEJA: isso é o browser, e mede-se num browser.
 */

const FONTE = readFileSync(
  "src/app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx",
  "utf8",
);
const CSS = readFileSync("src/app/globals.css", "utf8");

describe("o passo que chega apresenta-se", () => {
  it("o passo 1 entra com a classe, e continua montado quando sai", () => {
    // A classe depende do passo, e o `hidden` também: os dois no mesmo nó.
    expect(FONTE).toMatch(
      /className=\{`@container\/estudio \$\{step === "conteudo" \? "view-in" : ""\}`\}\s*\n\s*hidden=\{step !== "conteudo"\}/,
    );
  });

  it("o passo 3 entra com a classe, e continua montado quando sai", () => {
    expect(FONTE).toMatch(
      /className=\{step === "enviar" \? "view-in" : undefined\}\s+hidden=\{step !== "enviar"\}/,
    );
  });

  it("o passo 2 monta de raiz, portanto a classe basta-lhe", () => {
    expect(FONTE).toMatch(/\{step === "prever" && \(\n(?:.*\n)*?\s*<div className="view-in">/);
  });

  /**
   * O controlo que dá sentido aos três de cima: nenhum dos passos pode passar a
   * remontar. Se alguém puser um `key` num destes nós, o formulário do passo 1
   * volta a nascer a cada ida ao passo 2.
   */
  it("nenhum dos três passos troca a classe por um `key` que remonta", () => {
    expect(FONTE).not.toMatch(/hidden=\{step !== "conteudo"\}[\s\S]{0,200}?key=\{step\}/);
    expect(FONTE).not.toMatch(/key=\{step\}[\s\S]{0,200}?hidden=\{step !== "enviar"\}/);
  });

  /**
   * E a classe que os três pedem tem de continuar a ser o que a casa diz: a
   * banda dos estados, a curva de quem apresenta, `backwards` (para não deixar
   * transform pendurado a quebrar o `position: fixed` de uma folha aberta lá
   * dentro), e calada com movimento reduzido.
   */
  it("a `.view-in` continua a ser 240 ms, `backwards`, e cala-se com movimento reduzido", () => {
    expect(CSS).toMatch(
      /\.view-in\s*\{[\s\S]{0,2400}?animation:\s*view-in\s+240ms\s+cubic-bezier\(0,\s*0,\s*0\.2,\s*1\)\s+backwards/,
    );
    expect(CSS).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]{0,600}?\.view-in\s*\{\s*animation:\s*none/,
    );
  });
});

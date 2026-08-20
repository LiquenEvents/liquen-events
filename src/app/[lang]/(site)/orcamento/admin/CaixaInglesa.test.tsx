// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import CaixaInglesa from "./CaixaInglesa";

afterEach(cleanup);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAIXA INGLESA AO LADO DA PORTUGUESA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «hoje cada campo PT tem o seu EN empilhado por baixo,
 * duplicando a altura de tudo». O formulário dela tem cerca de dez mil píxeis
 * de altura, e numa proposta bilingue cada campo paga o dobro.
 *
 * A afirmação que vale por todas é a última: abaixo do limiar volta ao
 * empilhado, e é de propósito. Duas caixas de texto lado a lado num portátil
 * de treze polegadas são duas caixas onde não cabe uma frase.
 */
describe("a caixa ao lado da portuguesa", () => {
  const moldura = (aoLado: boolean) =>
    render(
      <CaixaInglesa
        aoLado={aoLado}
        campo={{ tipo: "headerTitle" }}
        rotulo="Título"
        valor=""
        onChange={() => {}}
      />,
    ).container.firstElementChild as HTMLElement;

  it("com a marca, deixa de quebrar a linha em ecrã largo", () => {
    // `basis-full` é o que a empurra para a linha de baixo; o `xl:basis-0` é o
    // que a traz de volta para o lado do par.
    const c = moldura(true).className;
    expect(c).toContain("basis-full");
    expect(c).toContain("xl:basis-0");
    expect(c).toContain("xl:flex-1");
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("sem a marca, fica empilhada — e continua a haver caixas assim", () => {
    // A linha adicional do orçamento vive numa célula estreita de uma grelha de
    // dois. Parti-la outra vez ao meio dava duas caixas onde não cabe
    // «Deslocação».
    const c = moldura(false).className;
    expect(c).toContain("basis-full");
    expect(c).not.toContain("xl:basis-0");
  });
});

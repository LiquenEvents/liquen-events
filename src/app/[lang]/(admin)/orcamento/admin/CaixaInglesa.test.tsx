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
 * A afirmação que vale por todas é a última: quando não cabe volta ao
 * empilhado, e é de propósito. Duas caixas de texto lado a lado com menos de
 * 12rem cada são duas caixas onde não cabe uma frase.
 *
 * ── E O QUE DECIDE JÁ NÃO É O ECRÃ ────────────────────────────────────────
 *
 * Era `xl:` — 1280 px de JANELA. Mas esta caixa vive numa fila, dentro de um
 * cartão, dentro de uma coluna que o índice do estúdio e o painel lateral
 * estreitam sem a janela encolher: a pergunta é «cabe nesta FILA?», e a
 * resposta da casa para essa pergunta é `flex-wrap` sozinho (regra 3 do
 * MOBILE-AUDIT). Agora são `basis-[12rem]` + `grow` + `min-w-[12rem]`: quebra
 * quando não cabe, e não quando a janela é pequena.
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

  it("com a marca, deixa de ter o `basis-full` que a empurrava para baixo", () => {
    // `basis-full` é o que a manda SEMPRE para a linha de baixo. Com a marca,
    // ela reserva 12rem e cresce com o que sobrar — fica ao lado do par sempre
    // que a fila dê para os dois.
    const c = moldura(true).className;
    expect(c).not.toContain("basis-full");
    expect(c).toContain("basis-[12rem]");
    expect(c).toContain("grow");
    // O mínimo é o que garante que, ao ficar ao lado, ainda é uma caixa de
    // escrever e não uma ranhura.
    expect(c).toContain("min-w-[12rem]");
  });

  it("não decide por pontos de corte do ECRÃ — não há nenhum", () => {
    // A regressão que isto guarda: alguém voltar a responder «cabe?» com a
    // largura da janela. Esta caixa vive dentro de um cartão dentro de uma
    // coluna; a janela não sabe nada sobre ela.
    const c = moldura(true).className;
    expect(c.split(/\s+/).filter((k) => /^(sm|md|lg|xl|2xl|max-\w+):/.test(k))).toEqual([]);
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
    expect(c).not.toContain("basis-[12rem]");
    expect(c).not.toContain("grow");
  });
});

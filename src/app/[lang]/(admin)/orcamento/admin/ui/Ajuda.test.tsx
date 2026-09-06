// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Ajuda } from "./Ajuda";
import { SAIDA_MS } from "./saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A EXPLICAÇÃO QUE SE PEDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O critério dela: os textos explicativos «são úteis na primeira vez, ruído a
 * partir da segunda». O que aqui se prende é o que faz este botão valer a pena
 * em vez de ser um `title` nativo: o texto NÃO está no ecrã até ser pedido,
 * abre-se pelo teclado como pelo dedo, e fecha-se por Escape.
 */

afterEach(cleanup);

const abrir = () => {
  act(() => {
    screen.getByRole("button").click();
  });
};

describe("Ajuda", () => {
  it("começa fechada — o texto não ocupa o ecrã de quem já sabe", () => {
    render(<Ajuda sobre="o que faz a caixa Extra">Marca a linha como opcional.</Ajuda>);
    expect(screen.queryByText("Marca a linha como opcional.")).toBeNull();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  /**
   * ── E O FECHO DEIXOU DE SER UM CORTE ─────────────────────────────────────
   *
   * Isto media «no fotograma seguinte ao clique o texto já não está no DOM» — e
   * media-o porque o painel desaparecia A SECO. Desde que ele sai com a
   * `.bo-saida` (200 ms), o nó fica montado esse tempo, e a pergunta certa
   * passou a ser outra: **para quem lê o ecrã, acabou já?** Sim — sai da árvore
   * de acessibilidade no instante do gesto. O nó some quando a animação acaba.
   */
  it("abre a pedido e volta a fechar", () => {
    vi.useFakeTimers();
    try {
      render(<Ajuda sobre="o que faz a caixa Extra">Marca a linha como opcional.</Ajuda>);
      abrir();
      expect(screen.getByText("Marca a linha como opcional.")).toBeTruthy();

      abrir();
      // No mesmo fotograma: fora da árvore de acessibilidade e fora do teclado.
      expect(screen.queryByRole("note")).toBeNull();
      // E ao fim da saída não sobra nó nenhum.
      act(() => {
        vi.advanceTimersByTime(SAIDA_MS + 20);
      });
      expect(screen.queryByText("Marca a linha como opcional.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  /** Dez botões «Ajuda» numa lista lida em voz alta são dez botões iguais. */
  it("o nome diz o ASSUNTO, para se saber o que é que ela explica", () => {
    render(<Ajuda sobre="o que faz a caixa Extra">texto</Ajuda>);
    expect(screen.getByRole("button", { name: "Ajuda: o que faz a caixa Extra" })).toBeTruthy();
  });

  it("o painel está ligado ao botão que o abre", () => {
    render(<Ajuda sobre="assunto">texto</Ajuda>);
    abrir();
    const botao = screen.getByRole("button");
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("note").id).toBe(botao.getAttribute("aria-controls"));
  });

  it("Escape fecha — quem anda pelo teclado não fica preso", () => {
    render(<Ajuda sobre="assunto">texto</Ajuda>);
    abrir();
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("carregar fora fecha — o painel não acompanha quem já foi escrever noutro sítio", () => {
    render(<Ajuda sobre="assunto">texto</Ajuda>);
    abrir();
    act(() => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(screen.queryByRole("note")).toBeNull();
  });
});

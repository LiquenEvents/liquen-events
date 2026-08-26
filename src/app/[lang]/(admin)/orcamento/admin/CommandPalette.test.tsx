// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette, { type Command } from "./CommandPalette";
import type { Quote } from "@/lib/orcamento/types";

/**
 * A paleta é a navegação de quem anda de teclado — é para isso que existe. O
 * que estes testes guardam não é o desenho, é o que torna as setas UTEIS:
 *
 *  1. **a escolha tem de ser dita.** O foco fica sempre na caixa de escrever;
 *     sem `aria-activedescendant` e sem `role="option"`, quem ouve o ecrã
 *     carrega em ↓ e não ouve absolutamente nada — depois carrega em Enter e
 *     abre o que calhar;
 *  2. **a escolha tem de estar à vista.** A lista rola dentro de uma caixa
 *     baixa; sem levar a linha escolhida connosco, ao quinto ↓ o realce está
 *     debaixo do rodapé e o que se vê é uma lista parada.
 */

const NAV: Command[] = [
  { id: "nav-overview", label: "Visão Geral", group: "Navegar", run: vi.fn() },
  { id: "nav-pedidos", label: "Pedidos", group: "Navegar", run: vi.fn() },
  { id: "nav-tarefas", label: "Tarefas", group: "Navegar", run: vi.fn() },
];

const QUOTES: Quote[] = [];

function abrir(extra: Partial<React.ComponentProps<typeof CommandPalette>> = {}) {
  return render(
    <CommandPalette
      open
      onClose={vi.fn()}
      navCommands={NAV}
      quotes={QUOTES}
      onOpenQuote={vi.fn()}
      {...extra}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CommandPalette", () => {
  it("a caixa de escrever tem nome próprio", async () => {
    abrir();
    expect(screen.getByRole("combobox", { name: /pesquisar/i })).toBeInTheDocument();
  });

  it("as setas movem uma escolha que é DITA — não só pintada", async () => {
    const user = userEvent.setup();
    abrir();
    const campo = screen.getByRole("combobox", { name: /pesquisar/i });
    await waitFor(() => expect(campo).toHaveFocus());

    const opcoes = screen.getAllByRole("option");
    expect(opcoes).toHaveLength(NAV.length);

    // Ao abrir, a escolha é a primeira — e isso está escrito nos dois sítios
    // onde um leitor de ecrã olha.
    expect(opcoes[0]).toHaveAttribute("aria-selected", "true");
    expect(campo).toHaveAttribute("aria-activedescendant", opcoes[0].id);

    await user.keyboard("{ArrowDown}");
    expect(opcoes[1]).toHaveAttribute("aria-selected", "true");
    expect(opcoes[0]).toHaveAttribute("aria-selected", "false");
    expect(campo).toHaveAttribute("aria-activedescendant", opcoes[1].id);
  });

  /**
   * "Sem resultados" é a resposta à escrita — e escrever não move o foco. Sem
   * uma região viva, quem ouve o ecrã escreve, não ouve nada e fica sem saber
   * se a paleta está a pensar, se partiu, ou se não há mesmo nada.
   */
  it("o «sem resultados» é dito, não só desenhado", async () => {
    const user = userEvent.setup();
    abrir();
    const campo = screen.getByRole("combobox", { name: /pesquisar/i });
    await waitFor(() => expect(campo).toHaveFocus());

    await user.type(campo, "zzzzzz");

    expect(screen.getByRole("status")).toHaveTextContent(/Sem resultados/);
  });

  it("a linha escolhida é trazida para dentro da caixa que rola", async () => {
    const user = userEvent.setup();
    const rolar = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
    abrir();
    await waitFor(() => expect(screen.getByRole("combobox", { name: /pesquisar/i })).toHaveFocus());
    rolar.mockClear();

    await user.keyboard("{ArrowDown}");

    const opcoes = screen.getAllByRole("option");
    expect(rolar).toHaveBeenCalled();
    expect(rolar.mock.instances).toContain(opcoes[1]);
  });
});

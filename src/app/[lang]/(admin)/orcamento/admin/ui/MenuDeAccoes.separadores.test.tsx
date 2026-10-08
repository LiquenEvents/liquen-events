// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MenuDeAccoes, type AccaoDeItem } from "./MenuDeAccoes";
import { MenuDeContexto, type PedidoDeMenu } from "../MenuDeContexto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS MENUS DA CASA — grupos, setas, foco e saída
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O «⋯» (`MenuDeAccoes`) e o botão direito (`MenuDeContexto`) desenham a mesma
 * lista de `AccaoDeItem`. A Fase 2 dos Temas pede-lhes quatro coisas que não
 * tinham: separadores entre grupos (com `role="separator"`), ↑/↓/Home/End,
 * o foco de volta a quem abriu o do botão direito, e a saída da casa nele.
 * E a regra de sempre: quem não usa o campo novo fica exactamente como estava.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const accoes = (agrupadas: boolean, onAccao = () => {}): AccaoDeItem[] => [
  { id: "abrir", rotulo: "Abrir", onAccao },
  { id: "ver", rotulo: "Pré-visualizar", onAccao },
  { id: "renomear", rotulo: "Renomear…", onAccao, separadorAntes: agrupadas },
  { id: "arquivar", rotulo: "Arquivar", onAccao, separadorAntes: agrupadas },
  { id: "eliminar", rotulo: "Eliminar…", onAccao, destrutiva: true, separadorAntes: agrupadas },
];

function abrirMenu(lista: AccaoDeItem[]) {
  render(<MenuDeAccoes accoes={lista} sobre="Terracotta" />);
  fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
  return screen.getByRole("menu");
}

describe("o menu do «⋯»", () => {
  it("desenha um `role=separator` antes de cada grupo declarado", () => {
    const menu = abrirMenu(accoes(true));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(3);
    // O da destrutiva é UM só, mesmo sendo ela também a primeira destrutiva.
    expect(menu.querySelectorAll('[aria-hidden="true"].border-t')).toHaveLength(0);
  });

  it("sem o campo, fica como estava: só o filete decorativo antes da destrutiva", () => {
    const menu = abrirMenu(accoes(false));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(menu.querySelectorAll('[aria-hidden="true"].border-t')).toHaveLength(1);
  });

  it("↓ ↑ Home End andam pelos itens, e a seta não sobe para o ecrã de baixo", () => {
    const deFora = vi.fn();
    render(
      <div onKeyDown={deFora}>
        <MenuDeAccoes accoes={accoes(true)} sobre="Terracotta" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    const itens = screen.getAllByRole("menuitem");
    itens[0].focus();
    fireEvent.keyDown(itens[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(itens[1], { key: "End" });
    expect(document.activeElement).toBe(itens[4]);
    // Dá a volta.
    fireEvent.keyDown(itens[4], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(itens[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(itens[4]);
    fireEvent.keyDown(itens[4], { key: "Home" });
    expect(document.activeElement).toBe(itens[0]);
    expect(deFora).not.toHaveBeenCalled();
  });

  it("cresce a partir do «⋯», com a entrada dos menus", () => {
    const menu = abrirMenu(accoes(true));
    expect(menu.className).toContain("bo-entrada-menu");
    expect(menu.className).toContain("origin-top-right");
  });
});

/** Um botão que abre o menu de contexto, como o cartão de tema faz. */
function ComOrigem({ lista }: { lista: AccaoDeItem[] }) {
  const [pedido, setPedido] = useState<PedidoDeMenu | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setPedido({ x: 40, y: 50, sobre: "Terracotta", accoes: lista })}
      >
        Cartão
      </button>
      <MenuDeContexto pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  );
}

function abrirContexto(lista: AccaoDeItem[]) {
  render(<ComOrigem lista={lista} />);
  const cartao = screen.getByRole("button", { name: "Cartão" });
  cartao.focus();
  fireEvent.click(cartao);
  return { cartao, menu: screen.getByRole("menu") };
}

describe("o menu do botão direito", () => {
  it("separadores, e a entrada dos menus a crescer do ponteiro", () => {
    const { menu } = abrirContexto(accoes(true));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(3);
    expect(menu.className).toContain("bo-entrada-menu");
    expect(menu.style.transformOrigin).not.toBe("");
  });

  it("sem o campo, nenhum `role=separator`", () => {
    const { menu } = abrirContexto(accoes(false));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it("↓ e End andam pelos itens", () => {
    abrirContexto(accoes(true));
    const itens = screen.getAllByRole("menuitem");
    // O foco entra no primeiro ao abrir.
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(itens[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(itens[1], { key: "End" });
    expect(document.activeElement).toBe(itens[4]);
  });

  it("o Escape devolve o foco a quem abriu", () => {
    const { cartao } = abrirContexto(accoes(true));
    expect(document.activeElement).not.toBe(cartao);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(cartao);
  });

  it("escolher um item devolve o foco ANTES da acção", () => {
    let focadoNaAccao: Element | null = null;
    const { cartao } = abrirContexto(
      accoes(true, () => {
        focadoNaAccao = document.activeElement;
      }),
    );
    fireEvent.click(screen.getAllByRole("menuitem")[2]);
    expect(focadoNaAccao).toBe(cartao);
  });

  it("sai com a saída da casa: 200 ms já sem ser um menu, e depois desaparece", () => {
    vi.useFakeTimers();
    const { menu } = abrirContexto(accoes(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    // Ainda montado, mas já não é um menu nem se lhe chega pelo teclado.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(menu.isConnected).toBe(true);
    expect(menu.className).toContain("bo-saida");
    expect(menu.getAttribute("aria-hidden")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(menu.isConnected).toBe(false);
  });
});

describe("a entrada dos menus no CSS", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  it("é a `.bo-entrada` com a duração, a curva e a escala dos tokens — nenhum número novo", () => {
    const regra = /\.bo-entrada-menu\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(regra).toContain("var(--transition-duration-quick)");
    expect(regra).toContain("var(--bo-escala-chegada)");
    expect(regra).not.toMatch(/\d+m?s\b/);
    expect(css).toMatch(
      /@supports[^{]*linear\(0, 1\)\)\s*\{\s*\.bo-entrada-menu\s*\{\s*animation-timing-function:\s*var\(--ease-quick\)/,
    );
  });
});

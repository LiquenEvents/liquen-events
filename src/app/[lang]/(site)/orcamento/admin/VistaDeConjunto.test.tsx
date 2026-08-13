// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VistaDeConjunto from "./VistaDeConjunto";
import type { MoodBoard } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS SETAS MOVEM CONTRA O QUE SE VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A vista só desenha as páginas COM fotografias — as vazias não são impressas.
 * As setas moviam contra a ordem COMPLETA: com uma página vazia pelo meio, a
 * seta trocava a página com essa, o ecrã ficava exactamente igual e lia-se como
 * uma seta avariada.
 */

afterEach(cleanup);

const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
  title: "Cerimónia",
  images: ["a.jpg"],
  ...over,
});

/** Três páginas com a do meio VAZIA: é o caso que a seta não resolvia. */
function desenhar(onMover = vi.fn()) {
  const boards = [
    board({ title: "Cocktail" }),
    board({ title: "Vazia", images: [] }),
    board({ title: "Jantar" }),
  ];
  render(
    <VistaDeConjunto
      boards={boards}
      ordem={[0, 1, 2]}
      urls={{ "a.jpg": "/a.jpg" }}
      aspetos={{ "a.jpg": 1.5 }}
      onMover={onMover}
      onSaltar={vi.fn()}
      onFechar={vi.fn()}
    />,
  );
  return onMover;
}

describe("VistaDeConjunto: reordenar", () => {
  it("a página vazia não aparece na lista", () => {
    desenhar();
    expect(screen.queryAllByText(/Vazia/)).toHaveLength(0);
    expect(screen.getAllByText(/Cocktail/).length).toBeGreaterThan(0);
  });

  /** O defeito: a última visível está na posição 3, a vizinha VISÍVEL na 1. */
  it("a seta para trás salta por cima da página vazia", () => {
    const onMover = desenhar();
    fireEvent.click(screen.getByLabelText("Mover a página 3 para trás"));
    expect(onMover).toHaveBeenCalledWith(2, 0);
  });

  it("a seta para a frente também", () => {
    const onMover = desenhar();
    fireEvent.click(screen.getByLabelText("Mover a página 1 para a frente"));
    expect(onMover).toHaveBeenCalledWith(0, 2);
  });

  /** Nas pontas da lista VISÍVEL não há para onde ir. A última visível estava
   *  na posição 3 de 3 e a sua seta para a frente já ficava desligada; a
   *  primeira é que ficava ligada a mexer no que não se vê. */
  it("nas pontas da lista visível as setas ficam desligadas", () => {
    desenhar();
    expect(screen.getByLabelText("Mover a página 1 para trás").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Mover a página 3 para a frente").hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByLabelText("Mover a página 1 para a frente").hasAttribute("disabled")).toBe(
      false,
    );
  });

  /** E a ponta da lista visível não é a ponta da lista toda: com a última
   *  página vazia, a seta da penúltima ficava ligada a trocar com ela — outro
   *  clique que não muda nada no ecrã. */
  it("a última visível não tem para onde ir, mesmo com páginas vazias por baixo", () => {
    render(
      <VistaDeConjunto
        boards={[board({ title: "Cocktail" }), board({ title: "Jantar" }), board({ images: [] })]}
        ordem={[0, 1, 2]}
        urls={{ "a.jpg": "/a.jpg" }}
        aspetos={{ "a.jpg": 1.5 }}
        onMover={vi.fn()}
        onSaltar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Mover a página 2 para a frente").hasAttribute("disabled")).toBe(
      true,
    );
  });

  /** Sem páginas vazias pelo meio, é o vizinho do lado — como sempre foi. */
  it("sem páginas vazias, move para a posição ao lado", () => {
    const onMover = vi.fn();
    render(
      <VistaDeConjunto
        boards={[board({ title: "Cocktail" }), board({ title: "Jantar" })]}
        ordem={[0, 1]}
        urls={{ "a.jpg": "/a.jpg" }}
        aspetos={{ "a.jpg": 1.5 }}
        onMover={onMover}
        onSaltar={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Mover a página 2 para trás"));
    expect(onMover).toHaveBeenCalledWith(1, 0);
  });
});

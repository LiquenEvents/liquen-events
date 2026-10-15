// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import EscolherDisposicao from "./EscolherDisposicao";
import { composicao } from "@/lib/pdf-editorial/mosaico";

/**
 * O selector da disposição de um tema (o pedido dela de 15/10): o desenho de
 * cada opção é a MESMA `composicao()` que o PDF usa, e as setas saltam as
 * opções que não servem.
 */

afterEach(cleanup);

const aspectos = [1.5, 0.67, 1, 1.4, 0.8];

describe("escolher a disposição de um tema", () => {
  it("o desenho de cada opção tem as células da página do PDF", () => {
    render(
      <EscolherDisposicao valor={null} aspectos={aspectos} vezPar={false} onEscolher={vi.fn()} />,
    );
    const destaque = screen.getByRole("radio", { name: "Destaque" });
    const rects = [...destaque.querySelectorAll("rect")].slice(-aspectos.length);
    const c = composicao(aspectos, false, "destaque");
    expect(c.tipo === "texto" ? [] : c.celulas).toEqual(
      rects.map((r) => ({
        x: Number(r.getAttribute("x")),
        y: Number(r.getAttribute("y")),
        w: Number(r.getAttribute("width")),
        h: Number(r.getAttribute("height")),
      })),
    );
  });

  it("as setas andam de opção em opção e saltam as que não servem", () => {
    const onEscolher = vi.fn();
    render(
      <EscolherDisposicao
        valor="texto-e-imagem"
        aspectos={[1.5, 1]}
        vezPar={false}
        onEscolher={onEscolher}
      />,
    );
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    // Depois de «Texto e imagem» vem a «Automática» (com 2 fotos, a grelha não serve).
    expect(onEscolher).toHaveBeenCalledWith(null);
  });

  it("«Usar em todos os temas» só aparece com uma escolha, e chama quem sabe fazê-lo", () => {
    const onAplicarATodos = vi.fn();
    const { rerender } = render(
      <EscolherDisposicao
        valor={null}
        aspectos={aspectos}
        vezPar={false}
        onEscolher={vi.fn()}
        onAplicarATodos={onAplicarATodos}
      />,
    );
    expect(screen.queryByRole("button", { name: /em todos os temas/ })).toBeNull();
    rerender(
      <EscolherDisposicao
        valor="soltas"
        aspectos={aspectos}
        vezPar={false}
        onEscolher={vi.fn()}
        onAplicarATodos={onAplicarATodos}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Usar «Soltas» em todos os temas" }));
    expect(onAplicarATodos).toHaveBeenCalled();
  });

  it("um tema fechado não muda", () => {
    render(
      <EscolherDisposicao
        valor={null}
        aspectos={aspectos}
        vezPar={false}
        desligado
        onEscolher={vi.fn()}
      />,
    );
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

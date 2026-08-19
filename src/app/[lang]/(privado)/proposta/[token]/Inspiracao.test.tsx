// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { textosDaPagina } from "./textos-da-pagina";

/**
 * A LUPA — o gesto que existe para as fotografias deixarem de ser pequenas.
 * Aqui prende-se o comportamento: o que abre, o que anda, o que fecha, e a
 * regra dos bytes (a grelha na miniatura, a lupa no original).
 */

const T = textosDaPagina("pt");

const FOTOS: Record<string, FotoDaProposta> = {
  a: { id: "a", miniatura: "mini/a", original: "orig/a", largura: 1200, altura: 800 },
  b: { id: "b", miniatura: "mini/b", original: "orig/b" },
  c: { id: "c", miniatura: "mini/c", original: "orig/c" },
};

const BOARD: BoardParaEcra = {
  chave: "b1",
  titulo: "Cerimónia",
  subtitulo: "Tons quentes",
  nota: "A escolher com a noiva",
  fotos: ["a", "b", "c"],
};

const desenhar = (board: BoardParaEcra = BOARD) =>
  render(
    <Inspiracao boards={[board]} fotosIniciais={FOTOS} token="tk" textos={T} />,
  );

/** A lupa, quando está aberta. */
const lupa = () => screen.queryByRole("dialog");
/** A fotografia grande — a que NÃO está dentro de um botão da grelha. */
const fotoDaLupa = () =>
  [...(lupa()?.querySelectorAll("img") ?? [])].find((i) => !i.hasAttribute("aria-hidden"));

const abrirPrimeira = () => fireEvent.click(screen.getAllByRole("button", { name: /Ampliar/ })[0]);

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("a grelha", () => {
  it("desenha uma célula por fotografia, com a miniatura", () => {
    desenhar();
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(3);
    expect(botoes.map((b) => b.querySelector("img")?.getAttribute("src"))).toEqual([
      "mini/a",
      "mini/b",
      "mini/c",
    ]);
  });

  it("a célula nasce com a forma da fotografia — para a página não saltar", () => {
    desenhar();
    const comForma = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    expect(comForma.style.aspectRatio).toBe("1200 / 800");
    // CONTROLO POSITIVO: a que NÃO tem forma guardada não inventa nenhuma. Sem
    // esta metade, um `aspectRatio` fixo escrito à mão passava o teste de cima.
    const semForma = screen.getAllByRole("button", { name: /Ampliar/ })[1];
    expect(semForma.style.aspectRatio).toBe("");
  });

  it("só as primeiras entram ansiosas — 46 de uma vez é a conta que isto evita", () => {
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c"] });
    const modos = [...document.querySelectorAll("img")].map((i) => i.getAttribute("loading"));
    expect(modos.slice(0, 4)).toEqual(["eager", "eager", "eager", "eager"]);
    expect(modos.slice(4)).toEqual(["lazy", "lazy"]);
  });
});

describe("a lupa", () => {
  it("abre no ORIGINAL — é o único sítio onde os pixéis todos valem os bytes", () => {
    desenhar();
    expect(lupa()).toBeNull();
    abrirPrimeira();
    expect(lupa()).not.toBeNull();
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("as setas do teclado andam, e não saem do board", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
    // Na primeira, a seta para trás não faz nada — e não rebenta.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("Escape fecha", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(lupa()).toBeNull();
  });

  it("o gesto para o lado anda; um dedo a rolar não muda de fotografia", () => {
    desenhar();
    abrirPrimeira();
    const d = lupa()!;
    // Arrastar para a ESQUERDA = fotografia seguinte.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // CONTROLO POSITIVO da recusa: um movimento sobretudo VERTICAL — rolar —
    // não pode mudar de fotografia, mesmo passando a distância mínima.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 500 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 220, clientY: 100 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // E um toque trémulo, abaixo da distância mínima, também não.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 280, clientY: 202 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
  });

  it("o foco entra no diálogo e volta ao sítio de onde saiu", () => {
    desenhar();
    const botao = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    botao.focus();
    fireEvent.click(botao);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: T.fechar }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(botao);
  });

  it("a página por baixo não rola enquanto a lupa está aberta", () => {
    desenhar();
    abrirPrimeira();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("quando as assinaturas morrem", () => {
  it("o botão volta a pedi-las — e nunca manda um caminho ao servidor", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ fotos: [{ id: "a", miniatura: "mini/a-nova", original: "orig/a-nova" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    desenhar();
    fireEvent.click(screen.getByRole("button", { name: T.recarregarFotos }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("/api/proposta/tk/fotos");
    // A regra: o cliente NUNCA nomeia um caminho. O pedido é o token e mais nada.
    expect(url).not.toContain("ref=");
    expect(url).not.toContain("path");
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")?.getAttribute("src"),
      ).toBe("mini/a-nova"),
    );
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * Acessibilidade da grelha, nos pontos que o audit automático NÃO vê e que
 * foram medidos como falhas: 24 pontos de tabulação numa ordem que saltava
 * 3625px para trás, o foco expulso da grelha ao fim de cada lote (403 de 427
 * fotos inalcançáveis sem rato) e 24 mosaicos a partilhar 11 nomes acessíveis.
 */

const photos = PHOTOS.slice(0, 40).map((p) => ({ ...p, aspectRatio: "3/2" }));

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tiles = () => [...document.querySelectorAll<HTMLElement>("[data-tile-idx]")];
/** As fotos 1-4 são montadas DUAS vezes (mosaico-herói em sm+, masonry em
    mobile) e o CSS esconde uma; para contar nomes ou índices só interessa uma. */
const gridTiles = () => [
  ...document.querySelectorAll<HTMLElement>('[data-tile-idx][data-tile-variant="grid"]'),
];
const maxIdx = () => Math.max(...tiles().map((e) => Number(e.dataset.tileIdx)));

describe("acessibilidade da grelha da galeria", () => {
  it("a grelha é UM ponto de tabulação, não um por foto", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const t = tiles();
    expect(t.length).toBeGreaterThan(1);
    expect(t.filter((e) => e.tabIndex === 0)).toHaveLength(1);
    expect(t[0].tabIndex).toBe(0);
  });

  it("cada mosaico tem nome próprio com a posição no conjunto", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const labels = gridTiles().map((e) => e.getAttribute("aria-label") ?? "");
    expect(new Set(labels).size).toBe(labels.length); // zero repetições
    expect(labels.every((l) => /foto \d+ de 40$/.test(l))).toBe(true);
    // O overlay decorativo não pode voltar a entrar no nome (era o que dava
    // "… Sophia & Artur Sophia & Artur CASAMENTO").
    expect(labels[0]).not.toMatch(/(\b\w+ & \w+\b).*\1/);
  });

  it("a grelha é um grupo com nome e instrução", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const group = screen.getByRole("group", { name: pt.galeria.gridLabel });
    expect(group).toBeInTheDocument();
    expect(group.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(pt.galeria.gridHint)).toBeInTheDocument();
  });

  it("a seta direita move o foco para a foto seguinte, sem sair da grelha", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const t = tiles();
    t[0].focus();
    fireEvent.keyDown(t[0], { key: "ArrowRight" });
    expect(document.activeElement?.getAttribute("data-tile-idx")).toBe("1");
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement?.getAttribute("data-tile-idx")).toBe("0");
  });

  it("a seta direita para lá do lote carregado monta mais fotos e foca a certa", () => {
    // Sem isto o teclado era expulso da grelha no fim de cada lote: o
    // IntersectionObserver do sentinela é assíncrono e o lote seguinte só
    // montava 3s depois de o utilizador já ter saído.
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const last = maxIdx();
    const el = document.querySelector<HTMLElement>(`[data-tile-idx="${last}"]`)!;
    el.focus();
    expect(document.querySelector(`[data-tile-idx="${last + 1}"]`)).toBeNull();
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(document.querySelector(`[data-tile-idx="${last + 1}"]`)).not.toBeNull();
    expect(document.activeElement?.getAttribute("data-tile-idx")).toBe(String(last + 1));
  });

  it("o contador continua montado (e anunciável) depois de todas as fotos carregarem", () => {
    render(<GaleriaClient photos={photos.slice(0, 8)} dict={pt.galeria} />);
    // 8 fotos < INITIAL_PAGE: já estão todas mostradas desde o primeiro render.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(`8 ${pt.galeria.de} 8`);
  });

  it("um botão 'Ver mais' focável existe sempre enquanto faltarem fotos", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    expect(
      screen.getByRole("button", { name: new RegExp(pt.galeria.verMais) }),
    ).toBeInTheDocument();
  });
});

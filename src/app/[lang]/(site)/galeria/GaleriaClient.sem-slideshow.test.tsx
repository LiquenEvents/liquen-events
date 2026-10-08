// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * O LIGHTBOX JÁ NÃO TEM SLIDESHOW.
 *
 * Saiu a pedido dela, com a captura do «▶» ao lado do «×»: «retira isto do
 * site da galeria». Com o botão foram a barra de espaço (que o ligava às
 * escondidas), a barra de progresso e o avanço sozinho. Estes testes prendem
 * as três coisas: não há botão, a barra de espaço não põe nada a andar, e a
 * fotografia aberta não muda sozinha por muito tempo que passe.
 */

const photos = PHOTOS.slice(0, 8).map((p) => ({ ...p, aspectRatio: "3/2" }));

/** Nº da foto aberta, lido do nome acessível do diálogo. */
const fotoAberta = () => {
  const label = screen.getByRole("dialog").getAttribute("aria-label") ?? "";
  const m = new RegExp(`${pt.galeria.lbPhoto} (\\d+) ${pt.galeria.lbOf}`).exec(label);
  return m ? Number(m[1]) : -1;
};

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
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

/** Abre a primeira foto. */
function abrir() {
  render(<GaleriaClient photos={photos} dict={pt.galeria} />);
  fireEvent.click(document.querySelector<HTMLElement>("[data-tile-idx]")!);
}

describe("o lightbox sem slideshow", () => {
  it("não há botão de iniciar o slideshow", () => {
    abrir();
    expect(screen.queryByRole("button", { name: pt.galeria.lbPlay })).toBeNull();
    expect(screen.queryByRole("button", { name: pt.galeria.lbPause })).toBeNull();
  });

  it("a fotografia não muda sozinha, nem depois da barra de espaço", () => {
    abrir();
    expect(fotoAberta()).toBe(1);
    // A barra de espaço, fora de um botão, era o atalho escondido do slideshow.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    act(() => vi.advanceTimersByTime(60_000));
    expect(fotoAberta()).toBe(1);
  });

  it("as setas continuam a mudar de fotografia", () => {
    abrir();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(fotoAberta()).toBe(2);
  });
});

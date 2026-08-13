// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * O SLIDESHOW DO LIGHTBOX TEM DE SOBREVIVER A MUDAR DE SEPARADOR.
 *
 * Não sobrevivia. O avanço é um `setTimeout` que se volta a armar a cada foto,
 * e o efeito que o arma desiste quando `document.hidden` é verdadeiro. Só que
 * `document.hidden` era LIDO uma vez, sem ninguém escutar `visibilitychange`:
 *
 *   • esconder o separador não parava nada — o temporizador já armado disparava
 *     na mesma e a fotografia avançava com o visitante a olhar para outra coisa
 *     (é essa a foto que ele não vê, e que não volta atrás);
 *   • e ao voltar não havia mudança de estado nenhuma que fizesse o efeito
 *     correr outra vez, portanto o slideshow ficava morto para o resto da
 *     visita — com o botão a dizer "Pausar" e `aria-pressed="true"`, ou seja,
 *     a afirmar que está a reproduzir.
 *
 * O separador escondido é o caso normal de quem põe o slideshow a andar: muda
 * de app no telemóvel, atende, volta. Voltava para um slideshow parado que se
 * dizia a andar.
 */

const photos = PHOTOS.slice(0, 8).map((p) => ({ ...p, aspectRatio: "3/2" }));

/** Nº da foto aberta, lido do nome acessível do diálogo. */
const fotoAberta = () => {
  const label = screen.getByRole("dialog").getAttribute("aria-label") ?? "";
  const m = new RegExp(`${pt.galeria.lbPhoto} (\\d+) ${pt.galeria.lbOf}`).exec(label);
  return m ? Number(m[1]) : -1;
};

/** Esconde/mostra o separador como o browser o faz: propriedade + evento. */
function separador(escondido: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => escondido });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

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

/** Abre a primeira foto e põe o slideshow a andar. */
function abrirEReproduzir() {
  render(<GaleriaClient photos={photos} dict={pt.galeria} />);
  fireEvent.click(document.querySelector<HTMLElement>("[data-tile-idx]")!);
  fireEvent.click(screen.getByRole("button", { name: pt.galeria.lbPlay }));
}

describe("slideshow do lightbox e o separador escondido", () => {
  it("avança sozinho enquanto o separador está à vista", () => {
    abrirEReproduzir();
    expect(fotoAberta()).toBe(1);
    act(() => vi.advanceTimersByTime(5000));
    expect(fotoAberta()).toBe(2);
  });

  it("com o separador escondido não avança — nem a foto já a caminho", () => {
    abrirEReproduzir();
    separador(true);
    act(() => vi.advanceTimersByTime(20_000));
    expect(fotoAberta(), "o separador estava escondido: ninguém viu estas fotos").toBe(1);
  });

  it("ao voltar ao separador, o slideshow continua a andar", () => {
    abrirEReproduzir();
    separador(true);
    act(() => vi.advanceTimersByTime(20_000));
    separador(false);

    // O botão continua a prometer que está a reproduzir; tem de ser verdade.
    expect(screen.getByRole("button", { name: pt.galeria.lbPause })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    const antes = fotoAberta();
    act(() => vi.advanceTimersByTime(5000));
    expect(fotoAberta(), "voltou-se ao separador e nada andava").toBe(antes + 1);
  });
});

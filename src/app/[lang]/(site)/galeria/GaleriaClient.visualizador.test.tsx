// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * O VISUALIZADOR DA GALERIA, 1.ª PARTE DO PLANO (GAL-1, GAL-3, GAL-9).
 *
 * O voo em si (as contas) está em `voo.test.ts`; o que se vê a mexer, nos
 * scripts de browser. Aqui prende-se o resto: o que entra e sai do DOM, e
 * quando.
 */

const CORES = [
  "#69412e",
  "#72624c",
  "#7e6642",
  "#b79c8c",
  "#ac8e74",
  "#98887c",
  "#2a2a2a",
  "#3e321b",
];
const photos = PHOTOS.slice(0, 8).map((p, i) => ({ ...p, aspectRatio: "3/2", color: CORES[i] }));

let reduzido = false;
beforeEach(() => {
  reduzido = false;
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
    matches: reduzido && q.includes("reduce"),
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
  // @ts-expect-error — limpar o `animate` posto à mão nalguns testes.
  delete Element.prototype.animate;
});

/** Um `animate` de mentira, que acaba logo. Conta quem o chamou. */
function comAnimate() {
  const chamadas: Element[] = [];
  Element.prototype.animate = function (this: Element) {
    chamadas.push(this);
    return {
      finished: Promise.resolve(),
      cancel() {},
      finish() {},
      onfinish: null,
    } as unknown as Animation;
  };
  return chamadas;
}

const dialogo = () => screen.queryByRole("dialog");
const camada = () => document.querySelector<HTMLElement>(".lb-photo-layer")!;
const grande = () => document.querySelector<HTMLImageElement>(".lb-photo-layer img.lb-grande");
const fundo = () => document.querySelector<HTMLElement>(".lb-backdrop")!;
const fotoAberta = () => {
  const m = new RegExp(`${pt.galeria.lbPhoto} (\\d+) ${pt.galeria.lbOf}`).exec(
    dialogo()?.getAttribute("aria-label") ?? "",
  );
  return m ? Number(m[1]) : -1;
};

function abrir(i = 0) {
  render(<GaleriaClient photos={photos} dict={pt.galeria} />);
  fireEvent.click(document.querySelector<HTMLElement>(`[data-tile-idx="${i}"]`)!);
}

/** Deixa correr as promessas e os fotogramas (a tira e as saídas). */
const esperar = (ms = 40) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("abrir sem mancha (GAL-1)", () => {
  it("a foto grande não traz o desfocado por cima da pré-visualização", () => {
    abrir();
    const img = grande()!;
    expect(img).not.toBeNull();
    expect(img.style.backgroundImage).toBe("");
    // Transparente até chegar: a marca só aparece no `onLoad`.
    expect(img.hasAttribute("data-carregada")).toBe(false);
  });

  it("depois de chegar, a foto grande fica marcada para entrar", async () => {
    abrir();
    await act(async () => {
      fireEvent.load(grande()!);
    });
    expect(grande()!.hasAttribute("data-carregada")).toBe(true);
  });

  it("ao mudar de foto, a pré-visualização da anterior sai — não há dupla exposição", () => {
    abrir();
    const antes = camada().querySelector("picture")!;
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(antes.isConnected).toBe(false);
    expect(camada().querySelectorAll("picture")).toHaveLength(1);
  });

  it("a miniatura de onde se abriu continua montada (era o buraco cinzento ao fechar)", () => {
    abrir(0);
    expect(dialogo()).not.toBeNull();
    const heroi = document.querySelector('[data-tile-variant="hero"][data-tile-idx="0"]')!;
    expect(heroi.querySelector("img")).not.toBeNull();
    const satelite = document.querySelector('[data-tile-variant="hero"][data-tile-idx="1"]')!;
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(satelite.querySelector("img")).not.toBeNull();
  });
});

describe("o fundo com a cor da fotografia (GAL-3)", () => {
  it("--lb-cor segue a foto aberta", () => {
    abrir();
    expect(fundo().style.getPropertyValue("--lb-cor")).toBe(CORES[0]);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(fundo().style.getPropertyValue("--lb-cor")).toBe(CORES[1]);
  });

  it("o fundo já não é preto liso", () => {
    abrir();
    expect(fundo().className).not.toMatch(/\bbg-black\b/);
  });
});

describe("fechar (GAL-1 e GAL-9)", () => {
  it("o aviso de cookies recolhe-se enquanto está aberto, e volta ao fechar", async () => {
    abrir();
    expect(document.documentElement.classList.contains("lightbox-aberta")).toBe(true);
    fireEvent.keyDown(window, { key: "Escape" });
    await esperar();
    expect(dialogo()).toBeNull();
    expect(document.documentElement.classList.contains("lightbox-aberta")).toBe(false);
  });

  it("com movimento reduzido fecha logo, sem animação nenhuma", async () => {
    reduzido = true;
    const chamadas = comAnimate();
    abrir();
    fireEvent.keyDown(window, { key: "Escape" });
    // Nem um fotograma de espera: era 260 ms parado, sem nada a mexer.
    expect(dialogo()).toBeNull();
    expect(chamadas).toHaveLength(0);
  });

  it("o ✕ pede para fechar uma vez só — e o Escape a seguir não repete a saída", async () => {
    const chamadas = comAnimate();
    abrir();
    const antes = chamadas.length;
    const x = screen.getByRole("button", { name: pt.galeria.lbClose });
    fireEvent.click(x);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(x);
    // Uma saída: um esbatimento do diálogo (no jsdom não há miniatura à vista).
    expect(chamadas.length - antes).toBe(1);
    await esperar();
    expect(dialogo()).toBeNull();
  });

  it("um clique nas faixas ao lado da foto fecha; na foto, não", async () => {
    abrir();
    // Camada de 1000×500; a foto 3:2 encaixa em 750×500, de x=125 a x=875.
    camada().getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 1000,
        height: 500,
        right: 1000,
        bottom: 500,
        x: 0,
        y: 0,
      }) as DOMRect;
    fireEvent.click(camada(), { clientX: 500, clientY: 250 });
    await esperar();
    expect(dialogo()).not.toBeNull();
    fireEvent.click(camada(), { clientX: 60, clientY: 250 });
    await esperar();
    expect(dialogo()).toBeNull();
  });
});

describe("o erro (GAL-9)", () => {
  it("quando nem o original vem, diz-o e deixa tentar de novo", async () => {
    abrir();
    // avif → webp → original → a frase.
    for (let i = 0; i < 3; i++) fireEvent.error(grande()!);
    expect(grande()).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain(pt.galeria.lbErro);
    fireEvent.click(screen.getByRole("button", { name: pt.galeria.lbTentar }));
    expect(screen.queryByRole("alert")).toBeNull();
    // Volta a pedir, do princípio da escada (AVIF).
    expect(grande()).not.toBeNull();
    expect(grande()!.getAttribute("src") ?? "").toMatch(/\.avif/);
  });

  it("os dois falhanços do meio não mostram a frase — só o último", () => {
    abrir();
    fireEvent.error(grande()!);
    fireEvent.error(grande()!);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("o teclado (GAL-9)", () => {
  it("Início vai para a primeira, Fim para a última", () => {
    abrir(3);
    expect(fotoAberta()).toBe(4);
    fireEvent.keyDown(window, { key: "End" });
    expect(fotoAberta()).toBe(photos.length);
    fireEvent.keyDown(window, { key: "Home" });
    expect(fotoAberta()).toBe(1);
  });
});

describe("o ecrã inteiro (GAL-9)", () => {
  it("«f» pede o ecrã inteiro para o visualizador, e não para a página", () => {
    abrir();
    const pedido = vi.fn(() => Promise.resolve());
    (dialogo() as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen =
      pedido;
    fireEvent.keyDown(window, { key: "f" });
    expect(pedido).toHaveBeenCalledTimes(1);
    // Com uma tecla de sistema carregada não é connosco (⌘F é procurar).
    fireEvent.keyDown(window, { key: "f", metaKey: true });
    expect(pedido).toHaveBeenCalledTimes(1);
  });
});

describe("a tira de miniaturas (GAL-9)", () => {
  const tira = () =>
    [...document.querySelectorAll<HTMLButtonElement>("[role=dialog] button[aria-label]")].filter(
      (b) =>
        new RegExp(`^${pt.galeria.lbPhoto} \\d+ ${pt.galeria.lbOf}`).test(
          b.getAttribute("aria-label")!,
        ),
    );

  it("a 390 px cabem 5, e numa secretária 7", async () => {
    vi.stubGlobal("innerWidth", 390);
    abrir(3);
    await esperar();
    expect(tira()).toHaveLength(5);
    cleanup();
    vi.stubGlobal("innerWidth", 1340);
    abrir(3);
    await esperar();
    expect(tira()).toHaveLength(7);
  });

  it("a dica do teclado vai com a classe que só aparece com rato", () => {
    abrir();
    const dica = screen.getByText(pt.galeria.keyboardHint);
    expect(dica.className).toMatch(/\blb-dica\b/);
    expect(dica.className).not.toMatch(/md:block/);
  });
});

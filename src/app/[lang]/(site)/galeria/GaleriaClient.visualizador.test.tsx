// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    // A tira chega dois fotogramas depois de abrir (`chromeReady`): espera-se
    // por ela, e não um número fixo de milissegundos — sob carga não chegava.
    abrir(3);
    await waitFor(() => expect(tira()).toHaveLength(5));
    cleanup();
    vi.stubGlobal("innerWidth", 1340);
    abrir(3);
    await waitFor(() => expect(tira()).toHaveLength(7));
  });

  it("a dica do teclado vive num «?» que só aparece com rato (GAL-4)", () => {
    abrir();
    // A linha de dicas comia altura à foto: passou a um botão na barra.
    expect(screen.queryByText(pt.galeria.keyboardHint)).toBeNull();
    const botao = screen.getByRole("button", { name: pt.galeria.lbAtalhos });
    expect(botao.className).toMatch(/\blb-dica\b/);
    expect(botao.className).not.toMatch(/md:block/);
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(pt.galeria.keyboardHint)).toBeInTheDocument();
    // Abrir as dicas não fecha o visualizador.
    expect(dialogo()).not.toBeNull();
  });
});

describe("navegar com o dedo, sem dar a volta (GAL-2)", () => {
  /**
   * Um gesto horizontal com o dedo, em eventos de ponteiro, que dura `ms`. O
   * `timeStamp` de cada evento vem do relógio, por isso o relógio é falso e
   * anda entre os passos — é dele que sai a velocidade.
   */
  function deslizar(dx: number, ms: number) {
    const c = camada();
    Object.defineProperty(c, "clientWidth", { configurable: true, value: 1000 });
    const base = { pointerId: 7, pointerType: "touch", clientY: 300 };
    const passos = 8;
    fireEvent.pointerDown(c, { ...base, clientX: 500 });
    for (let k = 1; k <= passos; k++) {
      vi.advanceTimersByTime(ms / passos);
      fireEvent.pointerMove(c, { ...base, clientX: 500 + (dx * k) / passos });
    }
    fireEvent.pointerUp(c, { ...base, clientX: 500 + dx });
  }
  beforeEach(() => void vi.useFakeTimers({ toFake: ["Date", "performance"] }));
  afterEach(() => void vi.useRealTimers());

  it("na primeira foto, ← e ‹ não vão para a última", () => {
    abrir(0);
    expect(fotoAberta()).toBe(1);
    expect(screen.queryByRole("button", { name: pt.galeria.lbPrev })).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(fotoAberta()).toBe(1);
  });

  it("na última foto, → não volta à primeira", () => {
    abrir(photos.length - 1);
    expect(fotoAberta()).toBe(photos.length);
    expect(screen.queryByRole("button", { name: pt.galeria.lbNext })).toBeNull();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(fotoAberta()).toBe(photos.length);
  });

  it("um deslize de mais de 20 % passa à seguinte; um curto e lento não", () => {
    abrir(2);
    deslizar(-60, 400);
    expect(fotoAberta(), "60 px devagar não chega").toBe(3);
    deslizar(-300, 400);
    expect(fotoAberta()).toBe(4);
  });

  it("deslizar para trás na primeira foto não sai dela", () => {
    abrir(0);
    deslizar(400, 200);
    expect(fotoAberta()).toBe(1);
  });

  it("o deslize na tira não muda de foto (o gesto é só da foto)", async () => {
    vi.useRealTimers();
    abrir(2);
    // A tira monta depois de a foto abrir: espera-se por ela, não por um tempo
    // fixo (com a máquina carregada, 40 ms não chegavam).
    const tira = (await screen.findAllByRole("button", { name: /^foto \d+ de/ }))[0].parentElement!;
    fireEvent.pointerDown(tira, { pointerId: 3, pointerType: "touch", clientX: 500, clientY: 800 });
    fireEvent.pointerMove(tira, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 800 });
    fireEvent.pointerUp(tira, { pointerId: 3, pointerType: "touch", clientX: 100, clientY: 800 });
    expect(fotoAberta()).toBe(3);
  });
});

describe("mais fotografia no ecrã (GAL-4)", () => {
  const cromagem = () => document.querySelector<HTMLElement>(".lb-cromagem")!;

  it("a barra e a tira escondem-se aos 2,5 s, e ficam `inert`", () => {
    vi.useFakeTimers();
    try {
      abrir(2);
      expect(cromagem().hasAttribute("data-escondido")).toBe(false);
      act(() => void vi.advanceTimersByTime(2_400));
      expect(cromagem().hasAttribute("data-escondido")).toBe(false);
      act(() => void vi.advanceTimersByTime(200));
      expect(cromagem().hasAttribute("data-escondido")).toBe(true);
      expect(cromagem().hasAttribute("inert")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("um toque NA foto mostra ou esconde a barra; um toque fora fecha", () => {
    abrir(2);
    const c = camada();
    c.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 1000,
        height: 500,
        right: 1000,
        bottom: 500,
      }) as DOMRect;
    // 3:2 numa caixa de 1000×500: a foto pintada vai de x=125 a 875.
    fireEvent.click(c, { clientX: 500, clientY: 250 });
    expect(cromagem().hasAttribute("data-escondido")).toBe(true);
    fireEvent.click(c, { clientX: 500, clientY: 250 });
    expect(cromagem().hasAttribute("data-escondido")).toBe(false);
    expect(dialogo()).not.toBeNull();
  });

  it("no telemóvel não há tira nem setas: ficam os gestos", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("coarse"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }));
    abrir(2);
    expect(screen.queryAllByRole("button", { name: /^foto \d+ de/ })).toHaveLength(0);
    expect(screen.queryByRole("button", { name: pt.galeria.lbNext })).toBeNull();
    expect(screen.getByRole("button", { name: pt.galeria.lbClose })).toBeInTheDocument();
  });

  it("a foto ocupa a camada inteira: a barra e a tira flutuam por cima", () => {
    abrir(2);
    expect(camada().className).toMatch(/\blb-palco\b/);
    expect(cromagem().contains(camada())).toBe(false);
  });
});

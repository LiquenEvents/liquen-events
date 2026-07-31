// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * RECARREGAR OU VOLTAR ATRÁS TEM DE DEIXAR O VISITANTE ONDE ELE ESTAVA.
 *
 * Não deixava, e o percurso em que falha é o normal de quem vê a galeria no
 * telemóvel. Medido num Chromium real (Pixel 7, build de produção), com o
 * visitante a 51 800 px e 108 das 427 fotos montadas (documento de 57 350 px):
 *
 *   recarregar                        51 800 px -> 7 807 px   (-43 993)
 *   voltar atrás (histórico duro)     51 800 px -> 7 807 px   (-43 993)
 *   voltar atrás (<Link> App Router)  51 800 px -> 7 807 px   (-43 993)
 *   pior corrida                      51 800 px ->   869 px   (-50 931)
 *
 * A mecânica: o browser TENTA restaurar (`history.scrollRestoration` = "auto"),
 * mas nesse instante o documento só tem as INITIAL_PAGE=12 fotos do HTML —
 * 8 646 px —, portanto a posição é cortada para o fim do documento curto
 * (8 646 - 839 de viewport = 7 807 px) e perde-se para sempre.
 *
 * Estes testes fixam as quatro peças de que a correcção depende, e cada um
 * falha se a sua peça for desfeita:
 *   1. a entrada de histórico é CARIMBADA (é o carimbo, e não o tipo de
 *      navegação, que distingue "voltei" de "cheguei agora");
 *   2. ao voltar, as fotos são repostas ANTES do salto (sem altura de
 *      documento não há posição nenhuma para onde saltar);
 *   3. o efeito do hash não encolhe o que o restauro repôs;
 *   4. o topo nunca é gravado, e a última posição de um scroll também é
 *      gravada (aresta de saída do estrangulamento).
 */

const photos = PHOTOS.slice(0, 200).map((p) => ({ ...p, aspectRatio: "3/2" }));
const CHAVE = "galeria:pos:";

/**
 * Altura simulada do documento. O jsdom não faz layout nenhum, e uma altura
 * CONSTANTE tornava metade destes testes cegos — o restauro só é difícil
 * porque a altura da galeria depende de quantas fotos estão montadas. Aqui a
 * altura é uma função do nº de mosaicos, tal como na página real (cada mosaico
 * reserva a sua caixa por `aspect-ratio`, ver GaleriaClient.layout.test.tsx).
 */
const ALTURA_MOSAICO = 550;
const alturaDocumento = () =>
  document.querySelectorAll('[data-tile-idx][data-tile-variant="grid"]').length * ALTURA_MOSAICO;
/** Posição simulada do scroll. */
let posY = 0;
/** Chamadas a window.scrollTo, com o nº de fotos montadas NO INSTANTE de cada. */
let saltos: { top: number; behavior?: string; contador: string | null }[] = [];
/** Fila de requestAnimationFrame, drenada à mão (o `hold` do restauro é um
    ciclo de rAF: com um rAF síncrono ele recorreria sem fim). */
let filaRaf: FrameRequestCallback[] = [];

function flushRaf(vezes = 1) {
  for (let i = 0; i < vezes; i++) {
    const fila = filaRaf;
    filaRaf = [];
    for (const cb of fila) cb(performance.now());
  }
}

const contador = () => screen.getByRole("status").textContent?.trim() ?? null;

function stubMatchMedia() {
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
}

beforeEach(() => {
  posY = 0;
  saltos = [];
  filaRaf = [];
  window.sessionStorage.clear();
  window.history.replaceState(null, "");
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
  // `onIdle` cai no requestIdleCallback quando existe: síncrono, para que o
  // efeito do hash (que corre em idle) já tenha corrido no fim do render.
  vi.stubGlobal("requestIdleCallback", (cb: IdleRequestCallback) => {
    cb({ didTimeout: false, timeRemaining: () => 50 } as IdleDeadline);
    return 1;
  });
  vi.stubGlobal("cancelIdleCallback", () => {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => filaRaf.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  stubMatchMedia();
  vi.stubGlobal("scrollTo", (opts: ScrollToOptions) => {
    saltos.push({
      top: opts?.top ?? 0,
      behavior: opts?.behavior,
      contador: document.querySelector('p[role="status"]')?.textContent?.trim() ?? null,
    });
    posY = opts?.top ?? 0;
  });
  Object.defineProperty(window, "scrollY", { configurable: true, get: () => posY });
  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => 800 });
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    get: alturaDocumento,
  });
  // O jsdom não implementa `history.scrollRestoration`; a correcção só lhe
  // toca quando existe, por isso o browser simulado tem de a ter.
  if (!("scrollRestoration" in window.history))
    Object.defineProperty(window.history, "scrollRestoration", {
      configurable: true,
      writable: true,
      value: "auto",
    });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const renderGaleria = () =>
  render(<GaleriaClient photos={photos} dict={pt.galeria} orderSeed=":teste" />);

/** Prepara uma entrada de histórico JÁ VISITADA, com posição guardada. */
function entradaComPosicao(id: string, pos: { y: number; shown: number; hash?: string }) {
  window.history.replaceState({ __NA: true, galeriaPos: id }, "");
  window.sessionStorage.setItem(
    CHAVE + id,
    JSON.stringify({ y: pos.y, shown: pos.shown, hash: pos.hash ?? "" }),
  );
}

describe("galeria — restauro da posição de scroll", () => {
  it("uma visita NOVA carimba a entrada e não restaura nada (arranque de 12 fotos intacto)", () => {
    renderGaleria();
    const estado = window.history.state as { galeriaPos?: string } | null;
    expect(typeof estado?.galeriaPos, "a entrada tem de ficar carimbada").toBe("string");
    // O arranque rápido é a razão de o INITIAL_PAGE ser 12: quem chega de novo
    // não pode pagar as fotos de ninguém.
    expect(contador()).toBe(`12 ${pt.galeria.de} ${photos.length}`);
    expect(saltos, "numa visita nova não se salta para lado nenhum").toEqual([]);
  });

  it("o carimbo preserva o resto do history.state (a árvore do App Router)", () => {
    window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["x"] }, "");
    renderGaleria();
    const estado = window.history.state as Record<string, unknown>;
    expect(estado.__NA).toBe(true);
    expect(estado.__PRIVATE_NEXTJS_INTERNALS_TREE).toEqual(["x"]);
    expect(typeof estado.galeriaPos).toBe("string");
  });

  it("ao VOLTAR à mesma entrada repõe as fotos e salta para a posição guardada", () => {
    entradaComPosicao("k1", { y: 51774, shown: 108 });
    renderGaleria();
    expect(contador(), "as fotos que estavam montadas têm de voltar").toBe(
      `108 ${pt.galeria.de} ${photos.length}`,
    );
    expect(saltos.length).toBeGreaterThan(0);
    expect(saltos[0].top).toBe(51774);
  });

  it("salta DEPOIS de repor as fotos — sem altura de documento não há posição", () => {
    entradaComPosicao("k2", { y: 51774, shown: 108 });
    renderGaleria();
    // O contador é lido DENTRO do stub de scrollTo: prova que, no instante do
    // salto, as 108 fotos já lá estavam. É esta ordem que o defeito original
    // não tinha — o browser saltava com 12 fotos montadas e a posição era
    // cortada para o fim de um documento de 8 646 px.
    expect(saltos[0]?.contador).toBe(`108 ${pt.galeria.de} ${photos.length}`);
  });

  it("o salto é INSTANTÂNEO (o `html` tem scroll-behavior: smooth)", () => {
    entradaComPosicao("k3", { y: 51774, shown: 108 });
    renderGaleria();
    // Sem `behavior: "instant"` o restauro herda o `scroll-behavior: smooth`
    // global (globals.css) e passa a ser um deslize animado de dezenas de
    // milhares de píxeis à frente do visitante — medido no defeito original:
    // 0 -> 7 807 px ao longo de ~600 ms, e numa das corridas o deslize entrou
    // em corrida com o scroll infinito e desceu a galeria inteira (225 865 px,
    // as 427 fotos carregadas).
    expect(saltos[0]?.behavior).toBe("instant");
  });

  it("não restaura para outra vista: hash guardado diferente do actual", () => {
    entradaComPosicao("k4", { y: 51774, shown: 108, hash: "#c-outro-casamento" });
    renderGaleria();
    expect(contador()).toBe(`12 ${pt.galeria.de} ${photos.length}`);
    expect(saltos).toEqual([]);
  });

  it("o efeito do hash NÃO encolhe o que o restauro repôs", () => {
    entradaComPosicao("k5", { y: 51774, shown: 108 });
    renderGaleria();
    // O efeito do hash corre em idle (aqui, síncrono) mesmo sem hash nenhum, e
    // fazia `setShown(PAGE)`. Sobre um restauro isso cortava o documento de 108
    // para 24 fotos — o MESMO encolhimento que faz o browser perder a posição.
    // (É a mesma guarda que impede o velho salto "12 de 427" -> "24 de 427"
    // ~1,3 s depois do arranque.)
    expect(contador()).toBe(`108 ${pt.galeria.de} ${photos.length}`);
  });

  it("desliga o restauro do browser (scrollRestoration = manual)", () => {
    renderGaleria();
    expect(window.history.scrollRestoration).toBe("manual");
  });
});

describe("galeria — registo da posição", () => {
  /** Dispara um scroll e drena o rAF do listener. */
  function scrollAte(y: number) {
    posY = y;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    act(() => flushRaf(2));
  }
  const guardado = (id: string) => {
    const raw = window.sessionStorage.getItem(CHAVE + id);
    return raw ? (JSON.parse(raw) as { y: number; shown: number }) : null;
  };
  const idDaEntrada = () => (window.history.state as { galeriaPos: string }).galeriaPos;

  it("grava a posição e quantas fotos estavam montadas", () => {
    renderGaleria();
    scrollAte(12345);
    const pos = guardado(idDaEntrada());
    expect(pos?.y).toBe(12345);
    expect(pos?.shown).toBeGreaterThanOrEqual(12);
  });

  it("NUNCA grava o topo — é a posição que a navegação do App Router impõe ao sair", async () => {
    renderGaleria();
    scrollAte(51774);
    expect(guardado(idDaEntrada())?.y).toBe(51774);
    // Fora da janela do estrangulamento, para que o scroll seguinte seja
    // gravado IMEDIATAMENTE — senão o teste passava mesmo sem a guarda, só
    // porque a gravação ficava adiada.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    // Sair da galeria por um <Link> faz o router ir ao topo com este listener
    // ainda ligado. Medido, sem esta guarda o `{y:51774}` virava `{y:0}` e o
    // voltar atrás repunha as 108 fotos deixando o visitante no topo — pior do
    // que o defeito original, que ao menos parava a 7 807 px.
    scrollAte(0);
    expect(guardado(idDaEntrada())?.y).toBe(51774);
  });

  it("grava a ÚLTIMA posição de um scroll, mesmo dentro da janela do estrangulamento", async () => {
    renderGaleria();
    scrollAte(10000);
    expect(guardado(idDaEntrada())?.y).toBe(10000);
    scrollAte(51774); // < 250 ms depois: apanhada pelo estrangulamento
    expect(guardado(idDaEntrada())?.y).toBe(10000);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    // Sem a aresta de saída a última posição perdia-se (não vem evento nenhum
    // depois dela): medido, o voltar atrás ficava 2 774 px acima do sítio.
    expect(guardado(idDaEntrada())?.y).toBe(51774);
  });
});

describe("galeria — o browser tem de ser desligado antes da hidratação", () => {
  it("page.tsx traz o script inline que põe scrollRestoration = manual", () => {
    const src = readFileSync(join(__dirname, "page.tsx"), "utf8");
    // Tem de ser um <script> no HTML, e não um efeito do componente nem um
    // <Script> do next/script: o browser aplica a posição guardada logo a
    // seguir à primeira disposição da página (medido: primeiro frame afectado
    // a t=11 ms), e com o CPU estrangulado 4x a hidratação da galeria mediu-se
    // a t≈2 086 ms. No meio ficava um restauro do browser que arrastava a
    // página até ao fundo (225 865 px, 427 fotos montadas) por alimentar o
    // sentinela do scroll infinito a cada passagem.
    expect(src).toMatch(/dangerouslySetInnerHTML/);
    expect(src).toMatch(/scrollRestoration\s*=\s*'manual'/);
    expect(src).not.toMatch(/from "next\/script"/);
  });
});

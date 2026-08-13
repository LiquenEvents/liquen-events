// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { pt } from "@/lib/i18n/pt";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PRÉ-CARGA DOS VIZINHOS NÃO PODE DISPUTAR A FOTOGRAFIA QUE SE ACABOU DE ABRIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O lightbox pré-carrega os dois vizinhos (+1 e -1) para que o `→` e o `←`
 * sejam instantâneos, e prende-os de propósito ao `heroLoaded`: enquanto a
 * fotografia VISÍVEL não chegar, os vizinhos não são pedidos. Está escrito no
 * componente — «so opening (and each ←/→ step) decodes only the visible photo
 * first — no hero-vs-neighbour decode contention».
 *
 * O portão estava aberto em TODOS os passos. O `heroLoaded` era reposto num
 * efeito PASSIVO (`useEffect(..., [index])`), que corre depois do commit: no
 * commit em que o índice muda, o `heroLoaded` ainda é o `true` da fotografia
 * ANTERIOR. Nesse commit os dois `<img>` dos vizinhos novos são montados — e
 * um `<img>` montado é um pedido à rede —, e só a seguir o efeito os volta a
 * arrancar do DOM.
 *
 * Medido com este mesmo arnês, num só `→`: dois `<img>` de vizinho criados e
 * removidos dentro da mesma interacção. Ou seja, em cada passo do lightbox
 * partiam dois pedidos de fotografia inteira ao mesmo tempo que a fotografia
 * que a pessoa está a olhar — exactamente a disputa que o portão existe para
 * evitar — e depois eram abortados, para voltarem a ser pedidos do zero
 * quando o herói chegasse.
 */

const photos = PHOTOS.slice(0, 8).map((p) => ({ ...p, aspectRatio: "3/2" }));

/** Os `<img>` de pré-carga: vivem na caixa escondida de 1x1 px. */
const precargas = () => [
  ...document.querySelectorAll<HTMLImageElement>("[aria-hidden].h-px.w-px img"),
];
/** A fotografia grande (o último `<img>` da camada — o `<picture>` vem antes). */
const heroi = () => [...document.querySelectorAll<HTMLImageElement>(".lb-photo-layer img")].at(-1)!;

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

/** Abre a primeira fotografia e dá-a por carregada. */
async function abrirEcarregar() {
  render(<GaleriaClient photos={photos} dict={pt.galeria} />);
  fireEvent.click(document.querySelector<HTMLElement>("[data-tile-idx]")!);
  // O `onLoad` do next/image passa por `img.decode()`, que é assíncrono.
  await act(async () => {
    fireEvent.load(heroi());
  });
}

describe("pré-carga dos vizinhos no lightbox", () => {
  it("não há vizinho nenhum pedido antes de a fotografia aberta chegar", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    fireEvent.click(document.querySelector<HTMLElement>("[data-tile-idx]")!);
    expect(precargas()).toHaveLength(0);
  });

  it("com a fotografia carregada, os dois vizinhos são pré-carregados", async () => {
    await abrirEcarregar();
    expect(precargas()).toHaveLength(2);
  });

  it("passar à fotografia seguinte não monta pré-cargas antes de ela chegar", async () => {
    await abrirEcarregar();

    // Tudo o que for CRIADO durante o passo, mesmo que desapareça a seguir: um
    // `<img>` que existiu por um commit já pediu o ficheiro à rede.
    const criados: string[] = [];
    const observador = new MutationObserver(() => {});
    observador.observe(document.body, { childList: true, subtree: true });

    fireEvent.click(screen.getByRole("button", { name: pt.galeria.lbNext }));

    for (const registo of observador.takeRecords()) {
      // Pelo PAI e não por `closest`: quando se lê o registo o `<img>` já foi
      // arrancado do documento, e um nó solto não tem antepassados nenhuns.
      const pai = registo.target as Element;
      if (!pai.matches?.("[aria-hidden].h-px.w-px")) continue;
      for (const no of registo.addedNodes)
        if (no instanceof HTMLImageElement) criados.push(no.getAttribute("src") ?? "");
    }
    observador.disconnect();

    expect(criados, "os vizinhos foram pedidos a competir com a foto aberta").toEqual([]);
    expect(precargas(), "e nenhum ficou montado").toHaveLength(0);
  });

  it("a escada de formato é DA fotografia: não transita para a seguinte", async () => {
    // A escada (avif → webp → ficheiro original) vive no MESMO carimbo que o
    // portão da pré-carga e mudou de forma com ele, por isso fica presa aqui.
    // O sintoma que a reposição por efeito passivo tinha era mais discreto do
    // que o dos vizinhos e não se vê no fim de uma interacção: uma fotografia
    // que tivesse caído no ficheiro original arrastava esse estado para a
    // seguinte durante um commit, ou seja pedia-a inteira, sem derivada, antes
    // de o efeito a repor em AVIF.
    await abrirEcarregar();
    expect(heroi().getAttribute("src")).toContain(".avif");

    fireEvent.error(heroi()); // sem AVIF → WebP
    expect(heroi().getAttribute("src")).toContain(".webp");
    fireEvent.error(heroi()); // sem derivada → ficheiro original
    expect(heroi().getAttribute("src")).toContain("/imagens/");

    fireEvent.click(screen.getByRole("button", { name: pt.galeria.lbNext }));
    expect(heroi().getAttribute("src"), "a foto seguinte recomeça em AVIF").toContain(".avif");
  });

  it("chegada a fotografia nova, os vizinhos DELA são pré-carregados", async () => {
    await abrirEcarregar();
    const antes = precargas().map((i) => i.getAttribute("src"));
    fireEvent.click(screen.getByRole("button", { name: pt.galeria.lbNext }));
    await act(async () => {
      fireEvent.load(heroi());
    });
    const depois = precargas().map((i) => i.getAttribute("src"));
    expect(depois).toHaveLength(2);
    expect(depois).not.toEqual(antes);
  });
});

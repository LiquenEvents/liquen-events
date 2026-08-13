// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAntecipacao } from "./useAntecipacao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARGEM TEM DE COMPRAR SEMPRE O MESMO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estes testes prendem não é um número de píxeis — é a propriedade que
 * torna a galeria previsível: **quem faz scroll depressa recebe mais margem**,
 * porque o que tem de ser constante é o tempo de aviso, não a distância.
 *
 * Sem isto, a mesma margem que chega para quem lê chega tarde para quem
 * procura, e é exactamente aí que se vê o buraco cinzento.
 */

const ALTURA = 900;

/** Simula um scroll a `pxPorSegundo`, em passos de um frame. */
function percorrer(pxPorSegundo: number, frames = 30) {
  let t = 0;
  let y = window.scrollY;
  for (let i = 0; i < frames; i++) {
    t += 16;
    y += (pxPorSegundo * 16) / 1000;
    vi.spyOn(performance, "now").mockReturnValue(t);
    window.scrollY = y;
    act(() => {
      window.dispatchEvent(new Event("scroll"));
      // O hook mede dentro de um requestAnimationFrame.
      vi.advanceTimersByTime(16);
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom não tem rAF com temporizador; encaminha-se para setTimeout para o
  // relógio falso o poder correr.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16),
  );
  Object.defineProperty(window, "innerHeight", { value: ALTURA, configurable: true });
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useAntecipacao", () => {
  it("parado, dá o piso de 2 ecrãs — nunca zero", () => {
    // Quem chega e não mexe tem de ter carregado o que vem a seguir na mesma:
    // o primeiro gesto não pode encontrar a página vazia.
    const { result } = renderHook(() => useAntecipacao());
    expect(result.current.ecras).toBe(2);
    expect(result.current.margemPx).toBe(2 * ALTURA);
  });

  it("um flick rápido compra mais margem do que uma leitura lenta", () => {
    // A propriedade que interessa, dita como desigualdade e não como número:
    // a margem CRESCE com a velocidade.
    const lento = renderHook(() => useAntecipacao());
    percorrer(800);
    const margemLenta = lento.result.current.margemPx;

    Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
    const rapido = renderHook(() => useAntecipacao());
    percorrer(5000);
    const margemRapida = rapido.result.current.margemPx;

    expect(margemRapida).toBeGreaterThan(margemLenta);
  });

  it("nunca passa do tecto de 6 ecrãs, por muito depressa que se vá", () => {
    // Sem tecto, isto deixava de antecipar e passava a descarregar a galeria
    // inteira de uma vez — o oposto do objectivo.
    const { result } = renderHook(() => useAntecipacao());
    percorrer(50_000);
    expect(result.current.ecras).toBeLessThanOrEqual(6);
    expect(result.current.margemPx).toBeLessThanOrEqual(6 * ALTURA);
  });

  /**
   * ── PARAR TAMBÉM É UMA VELOCIDADE ────────────────────────────────────────
   *
   * A suavização só era aplicada DENTRO do `scroll`: sem eventos, a velocidade
   * ficava congelada no último valor medido. Quem desse um flick a sério e
   * parasse para olhar para uma fotografia ficava com a margem colada aos 6
   * ecrãs — a página parada a descarregar como se ainda se estivesse a rolar
   * depressa, que é precisamente o que o tecto existe para evitar.
   */
  it("com a página parada, a margem volta ao piso de 2 ecrãs", () => {
    const { result } = renderHook(() => useAntecipacao());
    percorrer(50_000);
    expect(result.current.ecras, "o flick tinha de ter comprado margem").toBeGreaterThan(2);

    // O dedo levantou. Nem mais um evento de scroll — só o tempo a passar.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.ecras).toBe(2);
    expect(result.current.margemPx).toBe(2 * ALTURA);
  });

  it("o decaimento é gradual — não é um corte a pique", () => {
    // Cada mudança de degrau cria um IntersectionObserver novo; cair de 6 para
    // 2 num único passo, no instante em que o dedo levanta, é o mesmo salto que
    // a suavização existe para não dar.
    const { result } = renderHook(() => useAntecipacao());
    // Uma velocidade de leitura rápida, e não um flick absurdo: acima do tecto
    // o decaimento gasta as primeiras voltas a descer do que já não cabia.
    percorrer(4000);
    const doFlick = result.current.ecras;
    expect(doFlick).toBeGreaterThan(3);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    const aMeio = result.current.ecras;

    expect(aMeio).toBeLessThan(doFlick);
    expect(aMeio).toBeGreaterThan(2);
  });

  it("a margem vem em degraus inteiros de ecrã", () => {
    // Não é cosmética: quem a consome usa-a num `rootMargin`, e cada valor
    // novo obriga a criar um IntersectionObserver novo. Um número contínuo
    // criava um observador por frame de scroll.
    const { result } = renderHook(() => useAntecipacao());
    percorrer(3000);
    expect(result.current.margemPx % ALTURA).toBe(0);
  });
});

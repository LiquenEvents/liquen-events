// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import EntradaEmVideo from "./EntradaEmVideo";

let play: ReturnType<typeof vi.fn>;
let pausa: ReturnType<typeof vi.fn>;
let tiposQueToca: string[];
let vista: ((e: Array<{ isIntersecting: boolean }>) => void) | null;

beforeEach(() => {
  tiposQueToca = ["mp4"];
  vista = null;
  play = vi.fn(() => Promise.resolve());
  pausa = vi.fn();
  Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
    configurable: true,
    value: (tipo: string) => (tiposQueToca.some((t) => tipo.includes(t)) ? "probably" : ""),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", { configurable: true, value: pausa });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
  // Com o construtor de verdade (callback, opções): guarda-se o callback para
  // o teste poder dizer «a entrada saiu do ecrã».
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    constructor(cb: (e: Array<{ isIntersecting: boolean }>) => void, _opcoes?: unknown) {
      vista = cb;
    }
    observe() {}
    disconnect() {}
  };
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
});

async function montar() {
  const r = render(<EntradaEmVideo />);
  await act(async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
  });
  return r;
}

const videos = (c: HTMLElement) => [...c.querySelectorAll("video")] as HTMLVideoElement[];

describe("EntradaEmVideo", () => {
  /**
   * O pedido dela: «mal entremos no site, o vídeo comece logo a correr». A
   * prova é o HTML que vem do servidor: o vídeo 1 já lá está, a tocar sozinho,
   * antes de qualquer JavaScript.
   */
  it("o vídeo 1 vem no HTML do servidor, mudo e a arrancar sozinho", () => {
    const html = renderToStaticMarkup(<EntradaEmVideo />);
    const primeiro = html.match(/<video data-entrada-video="0"[^>]*>/)?.[0] ?? "";
    expect(primeiro).toMatch(/\bautoplay\b/);
    expect(primeiro).toMatch(/\bmuted\b/);
    expect(primeiro).toMatch(/\bplaysinline\b/);
    expect(primeiro).toMatch(/aria-hidden="true"/);
    expect(primeiro).toMatch(/tabindex="-1"/);
    expect(primeiro).not.toMatch(/\bcontrols\b/);
    // H.264 primeiro, VP9 como rede — os dois em 1080p.
    expect(html).toMatch(
      /<source src="\/videos\/entrada\/v2\/entrada-1-1080\.mp4"[^>]*>.*entrada-1-1080\.webm/,
    );
    // O 2.º não descarrega nada até ser preciso.
    expect(html).toMatch(/<video data-entrada-video="1" preload="none"/);
  });

  it("aparece por cima da fotografia quando JÁ está a tocar, e o 2 começa logo a carregar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    expect(play).toHaveBeenCalled();
    expect(a.style.opacity).toBe("0");
    expect(b.getAttribute("src")).toBeNull();

    act(() => void a.dispatchEvent(new Event("playing")));
    expect(a.style.opacity).toBe("1");
    expect(b.getAttribute("src")).toBe("/videos/entrada/v2/entrada-2-1080.mp4");
  });

  it("com «Poupar dados», os seguintes vêm na versão leve (720p)", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(b.getAttribute("src")).toMatch(/entrada-2-720\.mp4$/);
  });

  it("sem H.264 (o Chromium dos testes), os seguintes vêm em WebM", async () => {
    tiposQueToca = ["webm"];
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(b.getAttribute("src")).toMatch(/entrada-2-1080\.webm$/);
  });

  it("um browser que não toca nenhum dos formatos fica com a fotografia", async () => {
    tiposQueToca = [];
    await montar();
    expect(play).not.toHaveBeenCalled();
  });

  it("perto do fim, o seguinte entra por cima só com opacidade", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));

    Object.defineProperty(a, "duration", { configurable: true, value: 19 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 18.5, writable: true });
    Object.defineProperty(b, "readyState", { configurable: true, value: 4 });
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1);
    expect(b.style.opacity).toBe("0");

    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
  });

  it("pára quando a entrada sai do ecrã e retoma quando volta", async () => {
    const { container } = await montar();
    act(() => void videos(container)[0].dispatchEvent(new Event("playing")));
    play.mockClear();

    act(() => vista?.([{ isIntersecting: false }]));
    expect(pausa).toHaveBeenCalled();

    act(() => vista?.([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalled();
  });

  it("se o aparelho recusar arrancar sozinho (poupança de bateria), arranca ao primeiro toque", async () => {
    play.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
    );
    await montar();
    play.mockClear();
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("um pause() a meio do arranque (AbortError) não é recusa", async () => {
    play.mockImplementationOnce(() =>
      Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })),
    );
    const { container } = await montar();
    act(() => void videos(container)[0].dispatchEvent(new Event("playing")));
    expect(videos(container)[0].style.opacity).toBe("1");
  });

  it("um erro no ficheiro do vídeo seguinte deixa a fotografia", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    act(() => void b.dispatchEvent(new Event("error")));
    expect(a.style.opacity).toBe("0");
  });
});

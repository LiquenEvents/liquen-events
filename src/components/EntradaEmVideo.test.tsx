// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";

const movimento = vi.hoisted(() => ({ reduzido: false }));
vi.mock("@/lib/motion/useReducedMotion", () => ({
  useReducedMotion: () => movimento.reduzido,
  prefersReducedMotion: () => movimento.reduzido,
}));
// O `onIdle` corre já: o que se testa é o que acontece depois dele.
vi.mock("@/lib/onIdle", () => ({
  onIdle: (cb: () => void) => {
    cb();
    return () => {};
  },
}));

import EntradaEmVideo from "./EntradaEmVideo";

let play: ReturnType<typeof vi.fn>;
let tiposQueToca: string[];

beforeEach(() => {
  movimento.reduzido = false;
  tiposQueToca = ["mp4"];
  Object.defineProperty(HTMLMediaElement.prototype, "canPlayType", {
    configurable: true,
    value: (tipo: string) => (tiposQueToca.some((t) => tipo.includes(t)) ? "probably" : ""),
  });
  play = vi.fn(() => Promise.resolve());
  Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: play });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLMediaElement.prototype, "load", { configurable: true, value: vi.fn() });
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    observe() {}
    disconnect() {}
  };
  Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Monta e deixa as esperas (load, cortina, zoom) resolverem. */
async function montar() {
  const r = render(<EntradaEmVideo />);
  await act(async () => {
    for (let k = 0; k < 6; k++) await Promise.resolve();
  });
  return r;
}

const videos = (c: HTMLElement) => [...c.querySelectorAll("video")] as HTMLVideoElement[];

describe("EntradaEmVideo", () => {
  it("com movimento reduzido não há vídeo nenhum — fica a fotografia", async () => {
    movimento.reduzido = true;
    const { container } = await montar();
    expect(videos(container)).toHaveLength(0);
  });

  it("com «Poupar dados» também não", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    const { container } = await montar();
    expect(videos(container)).toHaveLength(0);
  });

  it("um browser que não toca nem H.264 nem VP9 fica com a fotografia", async () => {
    tiposQueToca = [];
    const { container } = await montar();
    expect(videos(container)).toHaveLength(0);
  });

  it("sem H.264 (o Chromium dos testes), pede o WebM de 720p", async () => {
    tiposQueToca = ["webm"];
    const { container } = await montar();
    expect(videos(container)[0].getAttribute("src")).toMatch(/entrada-1-720\.webm$/);
  });

  it("dois vídeos mudos, em linha, escondidos do leitor de ecrã e do Tab", async () => {
    const { container } = await montar();
    const vs = videos(container);
    expect(vs).toHaveLength(2);
    for (const v of vs) {
      expect(v.muted).toBe(true);
      expect(v.hasAttribute("muted")).toBe(true);
      expect(v.hasAttribute("playsinline")).toBe(true);
      expect(v.getAttribute("aria-hidden")).toBe("true");
      expect(v.tabIndex).toBe(-1);
      expect(v.hasAttribute("controls")).toBe(false);
    }
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o vídeo 1 só aparece quando JÁ está a tocar, e o 2 começa logo a carregar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    expect(a.getAttribute("src")).toMatch(/\/videos\/entrada\/v1\/entrada-1-(720|1080)\.mp4$/);
    expect(play).toHaveBeenCalled();
    // Ainda não está a tocar: continua invisível, por cima da fotografia.
    expect(a.style.opacity).toBe("0");
    expect(b.getAttribute("src")).toBeNull();

    act(() => void a.dispatchEvent(new Event("playing")));
    expect(a.style.opacity).toBe("1");
    expect(b.getAttribute("src")).toMatch(/entrada-2-/);
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

  it("se o browser recusar o play() (poupança de bateria), desiste e fica a fotografia", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    play.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
    );
    const { container } = await montar();
    await act(async () => {
      for (let k = 0; k < 4; k++) await Promise.resolve();
    });
    act(() => void vi.advanceTimersByTime(2000));
    expect(videos(container)).toHaveLength(0);
  });

  it("um pause() a meio do arranque (AbortError) não é recusa", async () => {
    play.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })),
    );
    const { container } = await montar();
    await act(async () => {
      for (let k = 0; k < 4; k++) await Promise.resolve();
    });
    expect(videos(container)).toHaveLength(2);
  });
});

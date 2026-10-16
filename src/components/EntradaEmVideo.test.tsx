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
  // A ordem dos vídeos é sorteada; aqui fixa-se em 1 → 2 → 3 (0,99 não troca
  // nada no baralhar), e o teste da ordem variada muda-o.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  tiposQueToca = ["mp4"];
  vista = null;
  play = vi.fn(() => Promise.resolve());
  pausa = vi.fn();
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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
    // Ao alto, a versão vertical; deitado, a larga. H.264 primeiro, VP9 como rede.
    expect(html).toContain(
      '<source media="(orientation: portrait)" src="/videos/entrada/v4/entrada-1-retrato.mp4"',
    );
    expect(html).toContain('<source src="/videos/entrada/v4/entrada-1-paisagem.mp4"');
    expect(html.indexOf("retrato.mp4")).toBeLessThan(html.indexOf("paisagem.mp4"));
    expect(html.indexOf("paisagem.mp4")).toBeLessThan(html.indexOf("paisagem.webm"));
    // Os outros não descarregam nada até o JavaScript os preparar.
    expect(html).toMatch(/<video data-entrada-video="1" preload="none"/);
    expect(html).toMatch(/<video data-entrada-video="2" preload="none"/);
  });

  it("aparece por cima da fotografia quando JÁ está a tocar, e o 2 começa logo a carregar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    expect(play).toHaveBeenCalled();
    expect(a.style.opacity).toBe("0");
    expect(b.getAttribute("src")).toBeNull();

    act(() => void a.dispatchEvent(new Event("playing")));
    expect(a.style.opacity).toBe("1");
    expect(b.getAttribute("src")).toBe("/videos/entrada/v4/entrada-2-paisagem.mp4");
  });

  it("no telemóvel ao alto, os seguintes vêm na versão vertical", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(b.getAttribute("src")).toMatch(/entrada-2-retrato\.mp4$/);
  });

  it("num ecrã denso, o vídeo com fonte 4K vem na versão grande", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(b.getAttribute("src")).toMatch(/entrada-2-grande\.mp4$/);
  });

  it("a ordem vai mudando: com outro sorteio, depois da floresta vem o 3", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = await montar();
    const [a, b, c] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    // É o 3 que se prepara primeiro, porque é o que vem a seguir.
    expect(c.getAttribute("src")).toMatch(/entrada-3-paisagem\.mp4$/);
    expect(b.getAttribute("src")).toBeNull();
  });

  it("sem H.264 (o Chromium dos testes), os seguintes vêm em WebM", async () => {
    tiposQueToca = ["webm"];
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(b.getAttribute("src")).toMatch(/entrada-2-paisagem\.webm$/);
  });

  it("um browser que não toca nenhum dos formatos fica com a fotografia", async () => {
    tiposQueToca = [];
    await montar();
    expect(play).not.toHaveBeenCalled();
  });

  it("perto do fim, o seguinte arranca e só sobe por cima quando já está a tocar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));

    // O 2 fica pronto (e o 3 começa a preparar-se a seguir, em cadeia).
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    expect(videos(container)[2].getAttribute("src")).toMatch(/entrada-3-paisagem\.mp4$/);
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 17.5, writable: true });
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1);
    expect(b.style.opacity).toBe("0");

    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(Number(b.style.zIndex)).toBeGreaterThan(Number(a.style.zIndex));
  });

  it("se o seguinte ainda não chegou, o actual REPETE-SE em vez de parar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    Object.defineProperty(a, "duration", { configurable: true, value: 18 });
    Object.defineProperty(a, "currentTime", { configurable: true, value: 17.5, writable: true });
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(a.loop).toBe(true);
    expect(b.style.opacity).toBe("0");

    // Quando o 2 chega, a passagem faz-se na volta seguinte.
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("timeupdate")));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
    expect(a.loop).toBe(false);
  });

  it("o «ended» é rede de segurança: segue para o seguinte se estiver pronto", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    act(() => void a.dispatchEvent(new Event("playing")));
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("ended")));
    expect(play).toHaveBeenCalledTimes(1);
    act(() => void b.dispatchEvent(new Event("playing")));
    expect(b.style.opacity).toBe("1");
  });

  it("preparar um vídeo é tocá-lo escondido até estar pronto (o iPhone só descarrega assim)", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    play.mockClear();
    act(() => void a.dispatchEvent(new Event("playing")));
    expect(play).toHaveBeenCalledTimes(1); // o 2, escondido
    expect(b.style.opacity).toBe("0");
    pausa.mockClear();
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    expect(pausa).toHaveBeenCalled(); // pronto: pára e espera pela sua vez
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

  describe("o vigia (nunca fica parado)", () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"],
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("se o browser parar o vídeo à vista, volta a tocá-lo", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      act(() => void a.dispatchEvent(new Event("playing")));
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      play.mockClear();
      act(() => void vi.advanceTimersByTime(1100));
      expect(play).toHaveBeenCalled();
    });

    it("se ficar encravado e o seguinte estiver pronto, segue para o seguinte", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      act(() => void a.dispatchEvent(new Event("playing")));
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 4, writable: true });
      act(() => void b.dispatchEvent(new Event("canplaythrough")));
      play.mockClear();
      act(() => void vi.advanceTimersByTime(5000));
      expect(play).toHaveBeenCalled();
      act(() => void b.dispatchEvent(new Event("playing")));
      expect(b.style.opacity).toBe("1");
    });

    it("fora do ecrã não insiste: o vídeo fica parado de propósito", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      act(() => void a.dispatchEvent(new Event("playing")));
      act(() => vista?.([{ isIntersecting: false }]));
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      play.mockClear();
      act(() => void vi.advanceTimersByTime(5000));
      expect(play).not.toHaveBeenCalled();
    });

    it("ao regressar à página pelo «voltar», retoma", async () => {
      await montar();
      play.mockClear();
      act(() => void window.dispatchEvent(new Event("pageshow")));
      expect(play).toHaveBeenCalled();
    });
  });
});

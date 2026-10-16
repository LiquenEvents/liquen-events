// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, cleanup } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import EntradaEmVideo, {
  GUIAO_DA_ENTRADA,
  HTML_DOS_VIDEOS,
  arrancarEntrada,
} from "./EntradaEmVideo";

let play: ReturnType<typeof vi.fn>;
let pausa: ReturnType<typeof vi.fn>;
let tiposQueToca: string[];
let vista: ((e: Array<{ isIntersecting: boolean }>) => void) | null;

beforeEach(() => {
  // A ordem dos vídeos é sorteada; aqui fixa-se em 1 → 2 → 3 (0,99 não troca
  // nada no baralhar), e o teste da ordem variada muda-o.
  vi.spyOn(Math, "random").mockReturnValue(0.99);
  localStorage.clear();
  // Sem `fetch`: os takes seguintes tocam da rede (o caminho antigo). Os
  // testes do download inteiro põem-no de volta.
  vi.stubGlobal("fetch", undefined);
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
  vi.unstubAllGlobals();
});

async function montar() {
  const r = render(<EntradaEmVideo />);
  await act(async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
  });
  return r;
}

const videos = (c: HTMLElement) => [...c.querySelectorAll("video")] as HTMLVideoElement[];

/** O take de entrada começa a tocar e já tem dados para seguir. */
function comecar(el: HTMLVideoElement) {
  act(() => void el.dispatchEvent(new Event("playing")));
  act(() => void el.dispatchEvent(new Event("canplaythrough")));
}

describe("EntradaEmVideo", () => {
  /**
   * O pedido dela: «mal entremos no site, o vídeo comece logo a correr». A
   * prova é o HTML que vem do servidor: o vídeo 1 já lá está, a tocar sozinho,
   * antes de qualquer JavaScript.
   */
  /**
   * O pedido dela: «mal entremos no site, o vídeo comece logo a correr». A
   * prova é o HTML que vem do servidor: os três vídeos mudos e, logo a seguir,
   * o guião que escolhe o take de entrada e o põe a tocar — antes de qualquer
   * JavaScript do sítio.
   */
  it("o HTML do servidor traz os vídeos mudos e o guião que arranca o take de entrada", () => {
    const html = renderToStaticMarkup(<EntradaEmVideo />);
    const tags = html.match(/<video [^>]*>/g) ?? [];
    expect(tags).toHaveLength(3);
    for (const t of tags) {
      expect(t).toMatch(/\bmuted\b/);
      expect(t).toMatch(/\bplaysinline\b/);
      expect(t).toMatch(/aria-hidden="true"/);
      expect(t).toMatch(/tabindex="-1"/);
      expect(t).not.toMatch(/\bcontrols\b/);
      // Nenhum descarrega nada sozinho: é o guião que escolhe qual.
      expect(t).toMatch(/preload="none"/);
      expect(t).not.toMatch(/\bautoplay\b/);
    }
    expect(html).toContain(`<script>${GUIAO_DA_ENTRADA}</script>`);
    // Cada take de entrada: ao alto a vertical, deitado a larga; HEVC antes do
    // H.264, e nunca AV1 (o Chrome di-lo tocar mesmo sem chip).
    for (let n = 1; n <= 3; n++) {
      expect(GUIAO_DA_ENTRADA).toContain(`entrada-${n}-retrato-hevc.mp4`);
      expect(GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-retrato-hevc.mp4`)).toBeLessThan(
        GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-retrato.mp4`),
      );
      expect(GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-paisagem-hevc.mp4`)).toBeLessThan(
        GUIAO_DA_ENTRADA.indexOf(`entrada-${n}-paisagem.mp4`),
      );
    }
    expect(GUIAO_DA_ENTRADA).toContain('codecs=\\"hvc1.');
    expect(GUIAO_DA_ENTRADA).not.toContain("av1");
  });

  describe("o take de entrada alterna de visita para visita", () => {
    /** Uma entrada no sítio: o HTML do servidor e o guião a correr nele. */
    function entrar() {
      document.body.innerHTML = `<div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      const guiao = document.querySelector("script");
      Object.defineProperty(document, "currentScript", { configurable: true, value: guiao });
      new Function(GUIAO_DA_ENTRADA)();
      Reflect.deleteProperty(document, "currentScript");
      const vs = [...document.querySelectorAll("video")];
      const n = vs.findIndex((v) => v.hasAttribute("data-primeiro"));
      return { vs, n };
    }
    afterEach(() => {
      document.body.innerHTML = "";
    });

    it("a 1.ª visita entra na floresta, a tocar sozinho, na versão do ecrã", () => {
      const { vs, n } = entrar();
      expect(n).toBe(0);
      expect(vs[0].autoplay).toBe(true);
      expect(
        vs[0].querySelector('source[media="(orientation: portrait)"]')?.getAttribute("src"),
      ).toBe("/videos/entrada/v4/entrada-1-retrato-hevc.mp4");
      expect(vs[1].querySelector("source")).toBeNull();
      expect(play).toHaveBeenCalled();
    });

    it("as seguintes entram num take que nunca é o da entrada anterior, e passam por todos", () => {
      vi.spyOn(Math, "random").mockRestore();
      let anterior = entrar().n;
      const vistos = new Set<number>([anterior]);
      for (let k = 0; k < 40; k++) {
        const { n } = entrar();
        expect(n).not.toBe(anterior);
        vistos.add(n);
        anterior = n;
      }
      expect(vistos).toEqual(new Set([0, 1, 2]));
    });

    it("com o armazenamento bloqueado (janela privada), entra na floresta e não rebenta", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new Error("bloqueado");
      });
      expect(entrar().n).toBe(0);
    });
  });

  describe("a cortina sobe com o vídeo", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    function comCortina() {
      document.body.innerHTML = `<div class="cortina"><p><span class="g"></span></p></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      const c = document.querySelector<HTMLElement>(".cortina")!;
      const pano = { currentTime: 0, pause: vi.fn(), play: vi.fn() };
      const frase = { currentTime: 0, pause: vi.fn(), play: vi.fn() };
      Object.assign(c, {
        getAnimations: (o?: { subtree?: boolean }) => (o?.subtree ? [pano, frase] : [pano]),
      });
      arrancarEntrada(
        [...Array(3)].map(() => "<source src='x.mp4' type='video/mp4'>"),
        "k",
        2500,
      );
      const v = document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
      return { v, pano, frase };
    }

    it("o take arranca escondido, pára no 1.º fotograma, e só anda quando o pano sobe", () => {
      const { v } = comCortina();
      expect(v.hasAttribute("data-a-espera")).toBe(true);
      Object.defineProperty(v, "readyState", { configurable: true, value: 4 });
      pausa.mockClear();
      v.dispatchEvent(new Event("playing"));
      expect(pausa).toHaveBeenCalled(); // pronto: parado à espera do pano
      play.mockClear();
      vi.advanceTimersByTime(1550);
      expect(play).not.toHaveBeenCalled();
      // O pano sobe aos 1980 ms; o vídeo arranca 0,35 s antes, ainda tapado.
      vi.advanceTimersByTime(100);
      expect(play).toHaveBeenCalledTimes(1);
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });

    it("se o vídeo não está pronto na hora, o pano e a frase esperam, e sobem com ele", () => {
      const { v, pano, frase } = comCortina();
      vi.advanceTimersByTime(2000);
      expect(pano.pause).toHaveBeenCalled();
      expect(frase.pause).toHaveBeenCalled();
      play.mockClear();
      Object.defineProperty(v, "readyState", { configurable: true, value: 4 });
      v.dispatchEvent(new Event("playing"));
      expect(play).toHaveBeenCalledTimes(1);
      expect(pano.play).toHaveBeenCalled();
      expect(frase.play).toHaveBeenCalled();
    });

    it("lê o instante da subida como o browser o devolve («1.98s»)", () => {
      document.documentElement.style.setProperty("--cortina-sobe", "1.98s");
      try {
        const { pano } = comCortina();
        vi.advanceTimersByTime(1550);
        expect(pano.pause).not.toHaveBeenCalled(); // não segura logo no início
        vi.advanceTimersByTime(100);
        expect(pano.pause).toHaveBeenCalled();
      } finally {
        document.documentElement.style.removeProperty("--cortina-sobe");
      }
    });

    it("nunca espera mais do que o tecto: sobe sem o vídeo", () => {
      const { v, pano } = comCortina();
      vi.advanceTimersByTime(2000 + 2500);
      expect(pano.play).toHaveBeenCalled();
      expect(v.hasAttribute("data-a-espera")).toBe(false);
    });

    it("sem cortina no ecrã (movimento reduzido, navegação dentro do sítio), arranca logo", () => {
      document.body.innerHTML = `<div class="cortina cortina--fora"></div><div data-entrada="">${HTML_DOS_VIDEOS}</div>`;
      arrancarEntrada(
        [...Array(3)].map(() => "<source src='x.mp4' type='video/mp4'>"),
        "k",
        2500,
      );
      const v = document.querySelector<HTMLVideoElement>("[data-primeiro]")!;
      expect(v.hasAttribute("data-a-espera")).toBe(false);
      expect(v.autoplay).toBe(true);
    });
  });

  it("aparece por cima da fotografia quando JÁ está a tocar, e o 2 começa logo a carregar", async () => {
    const { container } = await montar();
    const [a, b] = videos(container);
    expect(play).toHaveBeenCalled();
    expect(a.style.opacity).toBe("0");
    expect(b.getAttribute("src")).toBeNull();

    comecar(a);
    expect(a.style.opacity).toBe("1");
    expect(b.getAttribute("src")).toBe("/videos/entrada/v4/entrada-2-paisagem.mp4");
  });

  it("no telemóvel ao alto, os seguintes vêm na versão vertical", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    expect(b.getAttribute("src")).toMatch(/entrada-2-retrato\.mp4$/);
  });

  it("num ecrã denso, o vídeo com fonte 4K vem na versão grande", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
    expect(b.getAttribute("src")).toMatch(/entrada-2-grande\.mp4$/);
  });

  it("a ordem vai mudando: com outro sorteio, depois da floresta vem o 3", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { container } = await montar();
    const [a, b, c] = videos(container);
    comecar(a);
    // É o 3 que se prepara primeiro, porque é o que vem a seguir.
    expect(c.getAttribute("src")).toMatch(/entrada-3-paisagem\.mp4$/);
    expect(b.getAttribute("src")).toBeNull();
  });

  it("sem H.264 (o Chromium dos testes), os seguintes vêm em WebM", async () => {
    tiposQueToca = ["webm"];
    const { container } = await montar();
    const [a, b] = videos(container);
    comecar(a);
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
    comecar(a);

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
    comecar(a);
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
    comecar(a);
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
    comecar(a);
    expect(play).toHaveBeenCalledTimes(1); // o 2, escondido
    expect(b.style.opacity).toBe("0");
    pausa.mockClear();
    act(() => void b.dispatchEvent(new Event("canplaythrough")));
    expect(pausa).toHaveBeenCalled(); // pronto: pára e espera pela sua vez
  });

  it("pára quando a entrada sai do ecrã e retoma quando volta", async () => {
    const { container } = await montar();
    comecar(videos(container)[0]);
    play.mockClear();

    act(() => vista?.([{ isIntersecting: false }]));
    expect(pausa).toHaveBeenCalled();

    act(() => vista?.([{ isIntersecting: true }]));
    expect(play).toHaveBeenCalled();
  });

  it("se o aparelho recusar arrancar sozinho (poupança de bateria), arranca ao primeiro toque", async () => {
    play.mockImplementation(() =>
      Promise.reject(Object.assign(new Error("no"), { name: "NotAllowedError" })),
    );
    await montar();
    play.mockImplementation(() => Promise.resolve());
    play.mockClear();
    act(() => void window.dispatchEvent(new Event("pointerdown")));
    expect(play).toHaveBeenCalledTimes(1);
  });

  describe("o formato dos seguintes: pergunta-se ao aparelho", () => {
    type Resp = { supported: boolean; smooth: boolean; powerEfficient: boolean };
    const SIM: Resp = { supported: true, smooth: true, powerEfficient: true };
    const SEM_CHIP: Resp = { supported: true, smooth: true, powerEfficient: false };
    function aparelho(av1: Resp, hevc: Resp) {
      Object.defineProperty(navigator, "mediaCapabilities", {
        configurable: true,
        value: {
          decodingInfo: (c: { video: { contentType: string } }) =>
            Promise.resolve(c.video.contentType.includes("av01") ? av1 : hevc),
        },
      });
    }
    afterEach(() => {
      Reflect.deleteProperty(navigator, "mediaCapabilities");
    });

    async function srcDoSegundo() {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      return b.getAttribute("src");
    }

    it("AV1 quando o chip o descodifica e corre liso", async () => {
      aparelho(SIM, SIM);
      expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem-av1\.mp4$/);
    });

    it("HEVC quando o AV1 seria no processador (travava) e o HEVC é no chip", async () => {
      aparelho(SEM_CHIP, SIM);
      expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem-hevc\.mp4$/);
    });

    it("H.264 quando nenhum dos dois é no chip", async () => {
      aparelho(SEM_CHIP, SEM_CHIP);
      expect(await srcDoSegundo()).toMatch(/entrada-2-paisagem\.mp4$/);
    });
  });

  describe("cada take seguinte descarregado inteiro antes da sua vez", () => {
    let pedidos: string[];
    let responder: (ok: boolean) => void;
    beforeEach(() => {
      pedidos = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (url: string) =>
            new Promise((res, rej) => {
              pedidos.push(url);
              responder = (ok) =>
                ok
                  ? res({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) })
                  : rej(new Error("rede"));
            }),
        ),
      );
      let n = 0;
      Object.defineProperty(URL, "createObjectURL", {
        configurable: true,
        value: vi.fn(() => `blob:take-${++n}`),
      });
      Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    });
    const esperar = () =>
      act(async () => {
        for (let k = 0; k < 6; k++) await Promise.resolve();
      });

    it("descarrega-se para a memória e só se aquece perto do fim do take à vista", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      Object.defineProperty(a, "duration", { configurable: true, value: 18 });
      Object.defineProperty(a, "currentTime", { configurable: true, value: 2, writable: true });
      comecar(a);
      expect(pedidos).toEqual(["/videos/entrada/v4/entrada-2-paisagem.mp4"]);
      responder(true);
      await esperar();
      // Já está na memória, mas ainda faltam 16 s: não se põe a descodificar.
      expect(b.getAttribute("src")).toBeNull();
      a.currentTime = 15.5;
      act(() => void a.dispatchEvent(new Event("timeupdate")));
      expect(b.getAttribute("src")).toBe("blob:take-1");
      // E o seguinte da fila começa a descarregar quando este chegou.
      expect(pedidos[1]).toBe("/videos/entrada/v4/entrada-3-paisagem.mp4");
    });

    it("se o download falhar, toca da rede como antes", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
      responder(false);
      await esperar();
      expect(b.getAttribute("src")).toBe("/videos/entrada/v4/entrada-2-paisagem.mp4");
    });

    it("não divide a rede com o take de entrada enquanto ele não tem dados para seguir", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
      try {
        const { container } = await montar();
        const [a] = videos(container);
        act(() => void a.dispatchEvent(new Event("playing")));
        expect(pedidos).toEqual([]);
        act(() => void vi.advanceTimersByTime(4100));
        expect(pedidos).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("uma notificação, o aviso da bateria: volta sozinho", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("uma paragem que não foi nossa (o sistema) volta logo a tocar, e insiste", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      play.mockClear();
      act(() => void a.dispatchEvent(new Event("pause")));
      expect(play).toHaveBeenCalledTimes(1); // logo, sem esperar pelo vigia
      act(() => void vi.advanceTimersByTime(300));
      expect(play).toHaveBeenCalledTimes(2); // o sistema às vezes recusa o 1.º
      act(() => void vi.advanceTimersByTime(700));
      // A 1 s, outra vez (e o vigia, que também passa nesse segundo).
      expect(play.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it("uma paragem nossa (fora do ecrã) não se desfaz", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      act(() => vista?.([{ isIntersecting: false }]));
      play.mockClear();
      act(() => void a.dispatchEvent(new Event("pause")));
      act(() => void vi.advanceTimersByTime(1500));
      expect(play).not.toHaveBeenCalled();
    });

    it("ao voltar de outra aplicação, se a imagem não anda, um salto solta o descodificador", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      Object.defineProperty(a, "readyState", { configurable: true, value: 4 });
      let saltos = 0;
      let t = 7.2;
      Object.defineProperty(a, "currentTime", {
        configurable: true,
        get: () => t,
        set: (v: number) => {
          saltos++;
          t = v;
        },
      });
      act(() => void document.dispatchEvent(new Event("resume")));
      play.mockClear();
      act(() => void vi.advanceTimersByTime(600));
      expect(saltos).toBe(1);
      expect(t).toBe(7.2); // o mesmo instante: não salta para lado nenhum
      expect(play).toHaveBeenCalled();
    });

    it("se a imagem já anda ao voltar, não se lhe mexe", async () => {
      const { container } = await montar();
      const [a] = videos(container);
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: false });
      let t = 3;
      let saltos = 0;
      Object.defineProperty(a, "currentTime", {
        configurable: true,
        get: () => (t += 0.2),
        set: () => void saltos++,
      });
      act(() => void window.dispatchEvent(new Event("focus")));
      act(() => void vi.advanceTimersByTime(600));
      expect(saltos).toBe(0);
    });
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
      comecar(a);
      Object.defineProperty(a, "paused", { configurable: true, value: true });
      play.mockClear();
      act(() => void vi.advanceTimersByTime(1100));
      expect(play).toHaveBeenCalled();
    });

    it("se ficar encravado e o seguinte estiver pronto, segue para o seguinte", async () => {
      const { container } = await montar();
      const [a, b] = videos(container);
      comecar(a);
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
      comecar(a);
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

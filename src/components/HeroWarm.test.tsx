// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * O aquecimento dos heróis das outras páginas pede o MESMO ficheiro que o
 * `<picture>` delas vai escolher: AVIF onde o browser o lê. Antes pedia sempre
 * o WebP, que a página seguinte nunca usava — e o herói dela vinha a frio, por
 * trás do desfoque (ela, 16/10: «ainda dá para ver a foto desfocada»).
 */
vi.mock("@/lib/use-public-pathname", () => ({ usePublicPathname: () => "/" }));
vi.mock("@/lib/onIdle", () => ({
  onIdle: (cb: () => void) => {
    cb();
    return () => undefined;
  },
}));

let pedidos: string[];
let avif: boolean;
beforeEach(() => {
  vi.resetModules();
  pedidos = [];
  class FalsaImagem {
    width = 0;
    decoding = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      if (v.startsWith("data:image/avif")) {
        queueMicrotask(() => {
          if (avif) {
            this.width = 1;
            this.onload?.();
          } else this.onerror?.();
        });
        return;
      }
      pedidos.push(v);
    }
  }
  vi.stubGlobal("Image", FalsaImagem);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function aquecer() {
  const { default: HeroWarm } = await import("./HeroWarm");
  render(<HeroWarm />);
  await act(async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
  });
}

describe("HeroWarm", () => {
  it("num browser com AVIF, aquece os AVIF que as páginas vão usar", async () => {
    avif = true;
    await aquecer();
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((u) => u.endsWith(".avif"))).toBe(true);
    expect(pedidos.some((u) => u.includes("EW1_1330"))).toBe(true); // /servicos
  });

  it("sem AVIF, aquece os WebP", async () => {
    avif = false;
    await aquecer();
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((u) => u.endsWith(".webp"))).toBe(true);
  });
});

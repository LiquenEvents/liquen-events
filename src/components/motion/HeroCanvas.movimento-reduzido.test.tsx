// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * A CAMADA WEBGL DO HERÓI TEM DE PARAR PARA QUEM PEDIU MENOS MOVIMENTO.
 *
 * De todas as animações do sítio, esta é a única PERPÉTUA: deriva ambiente,
 * parallax do ponteiro e zoom ao scroll, a desenhar enquanto o herói estiver no
 * ecrã. É também a única que não tinha verificação nenhuma de
 * `prefers-reduced-motion` dentro de si. O cabeçalho do ficheiro prometia que
 * "reduced-motion devices simply keep the elegant static hero", mas quem
 * cumpria a promessa era o HeroWebGL — o chamador. Uma promessa cumprida pelo
 * chamador é uma promessa que se perde na primeira vez que alguém monta o
 * componente de outro sítio, ou devolve ao HeroWebGL as verificações de
 * capacidade que hoje tem desligadas.
 *
 * Este teste põe a promessa onde vive a animação. Tirar a linha
 * `if (prefersReducedMotion()) return;` do HeroCanvas põe o primeiro caso
 * vermelho: a tela aparece e o renderer é construído.
 */

const estado = vi.hoisted(() => ({ reduzido: false }));

vi.mock("@/lib/motion/useReducedMotion", () => ({
  prefersReducedMotion: () => estado.reduzido,
  useReducedMotion: () => estado.reduzido,
}));

// A GPU está sempre "disponível" aqui: queremos provar que a preferência do
// visitante trava a camada SOZINHA, e não que o jsdom não tem WebGL.
vi.mock("@/lib/motion/webgl", () => ({
  webglAvailable: () => true,
  glDpr: () => 1,
}));

const ogl = vi.hoisted(() => ({ renderers: 0 }));

vi.mock("ogl", () => {
  class Renderer {
    gl: unknown;
    constructor(opts: { canvas: HTMLCanvasElement }) {
      ogl.renderers += 1;
      this.gl = { canvas: opts.canvas, getExtension: () => ({ loseContext() {} }) };
    }
    setSize() {}
    render() {}
  }
  class Program {
    uniforms: Record<string, { value: unknown }>;
    constructor(_gl: unknown, opts: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = opts.uniforms;
    }
  }
  return {
    Renderer,
    Program,
    Triangle: class {},
    Mesh: class {},
    Texture: class {
      image: unknown;
    },
  };
});

import HeroCanvas from "./HeroCanvas";

class ObservadorInerte {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  estado.reduzido = false;
  ogl.renderers = 0;
  vi.stubGlobal("ResizeObserver", ObservadorInerte);
  vi.stubGlobal("IntersectionObserver", ObservadorInerte);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HeroCanvas e prefers-reduced-motion", () => {
  it("com movimento reduzido não desenha nada: nem tela, nem contexto WebGL", () => {
    estado.reduzido = true;
    const { container } = render(<HeroCanvas src="/imagens/EW1_1330.jpg" />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(ogl.renderers).toBe(0);
  });

  it("sem essa preferência, a camada monta-se na mesma (o efeito não desapareceu)", () => {
    estado.reduzido = false;
    const { container } = render(<HeroCanvas src="/imagens/EW1_1330.jpg" />);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(ogl.renderers).toBe(1);
  });

  it("a tela que monta é decorativa (aria-hidden) — nunca entra na árvore acessível", () => {
    const { container } = render(<HeroCanvas src="/imagens/EW1_1330.jpg" />);
    expect(container.querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });
});

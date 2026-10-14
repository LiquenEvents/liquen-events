// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import Sala from "./Sala";
import { mapaVazio, mudarMesa, novaMesa, type MapaDeMesas } from "@/lib/orcamento/mapa-de-mesas";

/**
 * A sala não pode andar por baixo das mesas (14/10, no site): «cada vez que
 * eu adiciono uma mesa, a sala aumenta» e «não dá para arrastar as mesas».
 * A sala que se via era alargada à volta do CENTRO das mesas — pôr uma mesa
 * ou largar uma arrastada mudava o centro, a sala ia atrás e a vista voltava
 * a encaixar, com a mesa no mesmo sítio do ecrã. Aqui prova-se que, dentro
 * da sala, pôr e mover mesas não mexe na vista.
 */

let medir: ((w: number, h: number) => void) | null = null;

beforeEach(() => {
  medir = null;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe() {
        medir = (w, h) =>
          this.cb(
            [{ contentRect: { width: w, height: h } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      disconnect() {}
      unobserve() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const nada = () => {};

function desenhar(mapa: MapaDeMesas) {
  return (
    <Sala
      mapa={mapa}
      lista={[]}
      seleccao={null}
      aSentar={false}
      onSeleccionar={nada}
      onMoverMesa={nada}
      onMoverElemento={nada}
      onApagar={nada}
      onTocarLugar={nada}
      onLevarPessoa={nada}
      cheio
    />
  );
}

const vista = (c: HTMLElement) => c.querySelector("svg[viewBox]")!.getAttribute("viewBox");

describe("a sala fica parada", () => {
  it("pôr mais mesas não muda a vista", () => {
    let m = novaMesa(mapaVazio(), "redonda", "m1").mapa;
    const { container, rerender } = render(desenhar(m));
    act(() => medir!(1400, 820));
    const antes = vista(container);
    m = novaMesa(m, "redonda", "m2").mapa;
    rerender(desenhar(m));
    m = novaMesa(m, "comprida", "m3").mapa;
    rerender(desenhar(m));
    expect(vista(container)).toBe(antes);
  });

  it("mover uma mesa dentro da sala não muda a vista (a mesa fica onde foi largada)", () => {
    let m = novaMesa(mapaVazio(), "redonda", "m1").mapa;
    m = novaMesa(m, "redonda", "m2").mapa;
    const { container, rerender } = render(desenhar(m));
    act(() => medir!(1400, 820));
    const antes = vista(container);
    const m2 = m.mesas.find((x) => x.id === "m2")!;
    m = mudarMesa(m, "m2", { x: m2.x + 300, y: m2.y + 200 });
    rerender(desenhar(m));
    expect(vista(container)).toBe(antes);
  });
});

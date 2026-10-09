// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * Auditoria externa, A5: a seta «descer» pára quando sai do ecrã.
 *
 * O componente é importado de novo em cada teste: a leitura do movimento
 * reduzido guarda o `MediaQueryList` ao nível do módulo.
 */
async function carregar() {
  vi.resetModules();
  return (await import("./SetaDeDescer")).default;
}
let cb: IntersectionObserverCallback | null = null;
class FakeIO {
  constructor(c: IntersectionObserverCallback) {
    cb = c;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  cb = null;
});

function ver(visivel: boolean) {
  act(() =>
    cb?.([{ isIntersecting: visivel } as IntersectionObserverEntry], {} as IntersectionObserver),
  );
}

describe("SetaDeDescer (A5)", () => {
  it("fora do ecrã pára; de volta, anima", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    const SetaDeDescer = await carregar();
    const { container } = render(<SetaDeDescer />);
    const seta = container.querySelector("svg")!;
    expect(seta.classList.contains("scroll-chevron")).toBe(true);
    ver(false);
    expect(seta.classList.contains("seta-parada")).toBe(true);
    ver(true);
    expect(seta.classList.contains("seta-parada")).toBe(false);
  });

  it("com movimento reduzido nem observa", async () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }));
    const SetaDeDescer = await carregar();
    render(<SetaDeDescer />);
    expect(cb).toBeNull();
  });
});

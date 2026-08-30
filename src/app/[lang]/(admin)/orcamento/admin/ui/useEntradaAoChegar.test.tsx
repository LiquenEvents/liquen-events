// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useEntradaAoChegar } from "./useEntradaAoChegar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BLOCO ESPERA PARA ENTRAR — MAS NUNCA ESPERA PARA SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A entrada do back office corria toda na montagem, incluindo a dos blocos
 * abaixo da dobra: animavam-se enquanto ninguém olhava. Passam a esperar pela
 * chegada ao ecrã, como o motor do site que ela mandou analisar.
 *
 * O que se guarda aqui não é o efeito bonito. É a parte perigosa: um bloco à
 * espera está INVISÍVEL, e portanto todos os caminhos pelos quais o aviso pode
 * não chegar têm de acabar com o bloco à vista. Numa ferramenta, uma animação
 * que não corre é um pormenor; um bloco que não aparece é trabalho perdido.
 */

function Bloco() {
  const ref = useEntradaAoChegar<HTMLDivElement>();
  return (
    <div ref={ref} className="bo-cena" data-testid="bloco">
      um bloco
    </div>
  );
}

/** As funções que o observador falso guardou, por elemento. */
let avisos: Array<() => void>;
let movimentoReduzido = false;

beforeEach(() => {
  avisos = [];
  movimentoReduzido = false;

  /**
   * `matches` é um GETTER e não um valor.
   *
   * O `useReducedMotion` guarda a `MediaQueryList` em cache ao nível do módulo,
   * de propósito e com a razão escrita lá: as primitivas de revelação
   * perguntam isto numa camada síncrona antes de pintar, dezenas de vezes por
   * página. Com um valor fixo, o primeiro teste deste ficheiro congelava a
   * resposta para todos os outros — e o caso do movimento reduzido passava a
   * medir o que o primeiro teste calhou de pedir.
   */
  vi.stubGlobal(
    "matchMedia",
    (consulta: string) =>
      ({
        get matches() {
          return consulta.includes("prefers-reduced-motion") ? movimentoReduzido : false;
        },
        media: consulta,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );

  class ObservadorFalso {
    private alvos: Element[] = [];
    constructor(private aoEntrar: IntersectionObserverCallback) {}
    observe(el: Element) {
      this.alvos.push(el);
      avisos.push(() =>
        this.aoEntrar(
          [{ target: el, isIntersecting: true } as unknown as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
      );
    }
    unobserve(el: Element) {
      this.alvos = this.alvos.filter((a) => a !== el);
    }
    disconnect() {
      this.alvos = [];
    }
  }
  vi.stubGlobal("IntersectionObserver", ObservadorFalso);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a entrada que espera pela chegada", () => {
  it("segura o bloco antes do primeiro pixel", () => {
    const { getByTestId } = render(<Bloco />);
    // `paused` e não `display: none`: a animação é a mesma, só está parada no
    // primeiro fotograma. Nada foi escondido de outra maneira.
    expect(getByTestId("bloco").style.animationPlayState).toBe("paused");
  });

  it("larga-o quando ele chega ao ecrã", () => {
    const { getByTestId } = render(<Bloco />);
    expect(avisos.length, "o bloco não chegou a ser observado").toBeGreaterThan(0);
    avisos.forEach((avisar) => avisar());
    expect(getByTestId("bloco").style.animationPlayState).toBe("");
  });

  it("e larga-o à mesma se o aviso nunca vier", () => {
    // A rede que interessa. Um bloco dentro de um separador escondido, um
    // elemento removido e reposto, um browser a fazer o que eu não previ: ao
    // fim de 1,2 s o bloco aparece, com ou sem aviso.
    vi.useFakeTimers();
    const { getByTestId } = render(<Bloco />);
    expect(getByTestId("bloco").style.animationPlayState).toBe("paused");
    vi.advanceTimersByTime(1500);
    expect(
      getByTestId("bloco").style.animationPlayState,
      "o bloco ficou à espera para sempre — isto é conteúdo perdido",
    ).toBe("");
  });

  it("não segura nada com o movimento reduzido ligado", () => {
    // Com movimento reduzido a `.bo-cena` não anima nada, portanto pausá-la
    // seria esconder o bloco para sempre.
    movimentoReduzido = true;
    const { getByTestId } = render(<Bloco />);
    expect(getByTestId("bloco").style.animationPlayState).toBe("");
  });

  it("não deixa o bloco pausado ao sair", () => {
    // O mesmo nó pode ser remontado noutra vista. Se saísse pausado, voltava
    // invisível e sem ninguém para o largar.
    const { getByTestId, unmount } = render(<Bloco />);
    const el = getByTestId("bloco");
    expect(el.style.animationPlayState).toBe("paused");
    unmount();
    expect(el.style.animationPlayState).toBe("");
  });
});

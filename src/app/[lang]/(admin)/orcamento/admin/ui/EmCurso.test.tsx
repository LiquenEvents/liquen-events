// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EmCurso } from "./EmCurso";
import { TECTO_DA_BARRA } from "@/lib/espera-em-curso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESPERA, DESENHADA DE UMA MANEIRA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se prende aqui é o que faz uma barra ser acreditada — e o que a faria
 * deixar de ser, que é o mesmo em todos os ecrãs onde isto for parar:
 *
 *  · com contagem, diz a VERDADE (47 de 312);
 *  · sem contagem, nunca chega ao fim — a resposta é que a fecha;
 *  · anima `transform` e nunca a largura;
 *  · não inventa uma barra quando não há nada com que a desenhar.
 */

/** Quanto é que o traço está cheio, lido do `scaleX`. */
function avanco(): number {
  const barra = document.querySelector("[data-barra=preenchimento]") as HTMLElement | null;
  const m = /scaleX\(([\d.]+)\)/.exec(barra?.style.transform ?? "");
  return m ? Number(m[1]) : NaN;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a espera sabida", () => {
  it("diz a verdade, e a contagem está no ecrã", () => {
    render(<EmCurso titulo="A importar fotos…" feito={47} total={312} />);
    expect(screen.getByText("47 de 312")).toBeTruthy();
    expect(avanco()).toBeCloseTo(47 / 312, 4);
  });

  it("chega mesmo ao fim quando acabou", () => {
    render(<EmCurso titulo="A importar fotos…" feito={312} total={312} />);
    expect(avanco()).toBe(1);
  });

  /** Um total a zero não é uma barra: é uma divisão por zero à espera. */
  it("sem total não desenha barra nenhuma", () => {
    render(<EmCurso titulo="A gravar…" feito={3} total={0} />);
    expect(Number.isNaN(avanco())).toBe(true);
    expect(screen.getByText("A gravar…")).toBeTruthy();
  });
});

describe("a espera opaca", () => {
  it("começa vazia e vai enchendo", () => {
    render(<EmCurso titulo="A enviar…" estimadoMs={10_000} />);
    expect(avanco()).toBe(0);
    act(() => void vi.advanceTimersByTime(5_000));
    const meio = avanco();
    expect(meio).toBeGreaterThan(0.5);
    act(() => void vi.advanceTimersByTime(5_000));
    expect(avanco()).toBeGreaterThan(meio);
  });

  /**
   * A REGRA QUE FAZ TODAS AS OUTRAS BARRAS VALEREM ALGUMA COISA.
   *
   * Uma barra que chega a 100% e fica lá parada ensina a não acreditar nela —
   * e a partir daí nenhuma barra do produto é lida.
   */
  it("nunca chega ao fim, por muito que se espere", () => {
    render(<EmCurso titulo="A enviar…" estimadoMs={1_000} />);
    act(() => void vi.advanceTimersByTime(600_000));
    // Ao fim de dez minutos numa espera estimada em um segundo, a curva está
    // tão perto do tecto que o `scaleX` já o imprime arredondado — por isso a
    // comparação é «não passa», e não «fica abaixo». O que interessa é o
    // segundo: nunca é 1.
    expect(avanco()).toBeLessThanOrEqual(TECTO_DA_BARRA);
    expect(avanco()).toBeLessThan(1);
  });

  it("passado muito tempo, diz outra coisa", () => {
    render(
      <EmCurso
        titulo="A enviar…"
        estimadoMs={1_000}
        nota="Vai para a Melanie."
        notaDemorada="Com rede fraca demora — não feches o separador."
      />,
    );
    expect(screen.getByText("Vai para a Melanie.")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(5_000));
    expect(screen.queryByText("Vai para a Melanie.")).toBeNull();
    expect(screen.getByText(/não feches o separador/)).toBeTruthy();
  });

  /** Sem contagem e sem estimativa fica o ponto e a frase — que é honesto. */
  it("sem estimativa não inventa uma barra", () => {
    render(<EmCurso titulo="A gravar…" />);
    expect(Number.isNaN(avanco())).toBe(true);
  });
});

describe("o desenho", () => {
  /** Mudar a largura obriga o navegador a refazer a linha a cada tique; o
   *  `transform` é composto sem repintar, e num telemóvel isso vê-se. */
  it("anima `transform` e nunca a largura", () => {
    render(<EmCurso titulo="A enviar…" estimadoMs={1_000} />);
    const barra = document.querySelector("[data-barra=preenchimento]") as HTMLElement;
    expect(barra.style.transform).toContain("scaleX");
    expect(barra.style.width).toBe("");
    expect(barra.className).toContain("origin-left");
  });

  it("é uma região viva, e educada", () => {
    render(<EmCurso titulo="A enviar…" estimadoMs={1_000} />);
    const caixa = screen.getByRole("status");
    expect(caixa.getAttribute("aria-live")).toBe("polite");
  });

  it("o «Parar» só existe quando há como parar", () => {
    const aoParar = vi.fn();
    const { rerender } = render(<EmCurso titulo="A importar…" feito={1} total={9} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<EmCurso titulo="A importar…" feito={1} total={9} aoParar={aoParar} />);
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    expect(aoParar).toHaveBeenCalled();
  });
});

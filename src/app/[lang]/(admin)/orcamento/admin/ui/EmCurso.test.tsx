// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { EmCurso, contagemEmBytes, useFimVisivel } from "./EmCurso";
import { FIM_VISIVEL_MS, PULSO } from "./movimento";
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
    // Avanço UNIFORME (§10): a meio do tempo estimado, a meio dos 85 %. Era
    // uma curva que disparava (> 50 % aqui) e depois quase parava.
    expect(meio).toBeCloseTo(0.425, 2);
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

describe("segundo o sistema de design (§10 e §8.2)", () => {
  it("a barra tem 4 px", () => {
    render(<EmCurso titulo="A enviar…" estimadoMs={1_000} />);
    const calha = document.querySelector("[data-barra=preenchimento]")!.parentElement!;
    expect(calha.className).toContain("h-1");
    expect(calha.className).not.toContain("h-[3px]");
  });

  it("o ponto pulsa com o pulso da casa, não o do Tailwind", () => {
    render(<EmCurso titulo="A enviar…" />);
    const ponto = document.querySelector("[data-em-curso=pulso]")!;
    expect(ponto.className).toContain(PULSO);
    expect(ponto.className).not.toContain("animate-pulse");
  });
});

describe("o fim vê-se", () => {
  it("`concluido` enche a barra, troca o ponto pelo visto e diz que está pronto", () => {
    render(<EmCurso titulo="A gerar o PDF…" estimadoMs={10_000} concluido pronto="PDF pronto" />);
    expect(avanco()).toBe(1);
    expect(screen.getByText("PDF pronto")).toBeTruthy();
    expect(screen.queryByText("A gerar o PDF…")).toBeNull();
    expect(document.querySelector("[data-em-curso=visto]")).toBeTruthy();
    expect(document.querySelector("[data-em-curso=pulso]")).toBeNull();
  });

  it("com bytes, a contagem fala em KB/MB", () => {
    render(<EmCurso titulo="A descarregar…" feito={1_250_000} total={5_100_000} emBytes />);
    expect(screen.getByText(contagemEmBytes(1_250_000, 5_100_000))).toBeTruthy();
    expect(contagemEmBytes(1_250_000, 5_100_000)).toMatch(/MB$/);
  });

  it("o `useFimVisivel` fica no ecrã um instante depois de acabar, e sai", () => {
    const { result, rerender } = renderHook(({ a, ok }) => useFimVisivel(a, ok), {
      initialProps: { a: true, ok: true },
    });
    expect(result.current).toEqual({ mostrar: true, concluido: false });
    rerender({ a: false, ok: true });
    expect(result.current).toEqual({ mostrar: true, concluido: true });
    act(() => void vi.advanceTimersByTime(FIM_VISIVEL_MS));
    expect(result.current).toEqual({ mostrar: false, concluido: false });
  });

  it("uma falha não finge que acabou bem: sai logo, sem «pronto»", () => {
    const { result, rerender } = renderHook(({ a, ok }) => useFimVisivel(a, ok), {
      initialProps: { a: true, ok: false },
    });
    rerender({ a: false, ok: false });
    expect(result.current).toEqual({ mostrar: false, concluido: false });
  });
});

describe("às cegas e depois com o tamanho", () => {
  /** Medido no mapa de mesas com a rede lenta: ia nos 95 % e caía para 32 %. */
  it("quando os bytes chegam, a barra continua de onde estava — nunca anda para trás", () => {
    const { rerender } = render(<EmCurso titulo="A preparar o PDF…" estimadoMs={1_000} />);
    act(() => void vi.advanceTimersByTime(3_000));
    const cego = avanco();
    expect(cego).toBeGreaterThan(0.85);

    rerender(<EmCurso titulo="A preparar o PDF…" estimadoMs={1_000} feito={10} total={100} />);
    const comBytes = avanco();
    expect(comBytes).toBeGreaterThanOrEqual(cego);
    expect(comBytes).toBeLessThan(1);
    // A contagem diz os bytes verdadeiros, não o traço.
    expect(screen.getByText("10 de 100")).toBeTruthy();

    rerender(<EmCurso titulo="A preparar o PDF…" estimadoMs={1_000} feito={100} total={100} />);
    expect(avanco()).toBe(1);
  });

  it("sabida desde o início, conta como sempre contou", () => {
    render(<EmCurso titulo="A importar fotos…" feito={47} total={312} />);
    expect(avanco()).toBeCloseTo(47 / 312, 4);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Miniaturas from "./Miniaturas";

vi.mock("./Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * O que aqui interessa provar são três coisas, e nenhuma delas é «desenha uma
 * caixa»:
 *
 *  1. **contar não escreve.** É a propriedade que faz o botão ser carregável
 *     sem medo, e é a única maneira de a hipótese cair depressa se estiver
 *     errada;
 *  2. **a geração anda aos poucos até acabar.** O servidor faz um lote de cada
 *     vez; se este ecrã não repetisse, ela via «25 geradas» e ficava a achar
 *     que tinha acabado com quatrocentas por fazer;
 *  3. **um lote que não gera nada pára o ciclo.** Sem isso, uma fotografia
 *     corrompida — que falha sempre — punha o browser a repetir o mesmo pedido
 *     duzentas vezes.
 */

function respostaDe(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Miniaturas", () => {
  let chamadas: { metodo: string }[] = [];

  beforeEach(() => {
    chamadas = [];
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("contar não escreve nada — só faz GET", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        chamadas.push({ metodo: init?.method ?? "GET" });
        return respostaDe({ ok: true, linhas: [], fotos: 120, emFalta: 0, avisos: [] });
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));

    await waitFor(() => expect(screen.getByText(/nenhuma em falta/i)).toBeInTheDocument());
    expect(chamadas).toEqual([{ metodo: "GET" }]);
    // Sem nada em falta não há nada para gerar, e o botão não aparece.
    expect(screen.queryByRole("button", { name: /gerar/i })).toBeNull();
  });

  it("gera aos poucos até não sobrar nenhuma", async () => {
    const lotes = [
      { ok: true, geradas: 25, falhas: [], restantes: 30 },
      { ok: true, geradas: 25, falhas: [], restantes: 5 },
      { ok: true, geradas: 5, falhas: [], restantes: 0 },
    ];
    let volta = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo });
        if (metodo === "POST") return respostaDe(lotes[volta++] ?? lotes[2]);
        // A contagem: cheia antes de gerar, vazia depois.
        return respostaDe({
          ok: true,
          linhas: [],
          fotos: 100,
          emFalta: volta === 0 ? 55 : 0,
          avisos: [],
        });
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as 55/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as 55/i }));

    await waitFor(() => expect(screen.getByText(/nenhuma em falta/i)).toBeInTheDocument());
    // Três lotes, nem mais nem menos: parar ao segundo deixava trinta por fazer.
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(3);
  });

  /**
   * A SEGUNDA PASSAGEM COMEÇA DO ZERO.
   *
   * A primeira faz 52 e deixa 8 por fazer. Ao carregar em "Gerar as 8", a
   * contagem anterior ficava lá: enquanto o primeiro lote não respondia — que
   * num lote grande são segundos — o botão dizia «A gerar… 52/8» e a barra
   * estava cheia sem nada ter sido feito. Uma barra que mente uma vez deixa de
   * se poder ler.
   */
  it("uma segunda passagem não começa com a contagem da primeira", async () => {
    let posts = 0;
    let emFalta = 60;
    const soltar: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo });
        if (metodo === "POST") {
          posts += 1;
          if (posts === 1) {
            emFalta = 8;
            return respostaDe({
              ok: true,
              geradas: 52,
              falhas: Array.from({ length: 8 }, (_, i) => `theme-thumbs/x/${i}.jpg`),
              restantes: 0,
            });
          }
          // A segunda fica pendurada: é este o instante que interessa ver.
          return new Promise<Response>((resolve) => {
            soltar.push(() =>
              resolve(respostaDe({ ok: true, geradas: 0, falhas: [], restantes: 0 })),
            );
          });
        }
        return respostaDe({ ok: true, linhas: [], fotos: 100, emFalta, avisos: [] });
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as 60/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as 60/i }));

    await waitFor(() => screen.getByRole("button", { name: /gerar as 8/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as 8/i }));

    expect(screen.getByRole("button", { name: /a gerar/i }).textContent).toBe("A gerar… 0/8");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    soltar[0]?.();
  });

  it("um lote que não gera nada pára o ciclo em vez de repetir para sempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo });
        // Sempre a mesma resposta: nada gerado, e continua a haver que fazer.
        // É o que uma fotografia corrompida produz.
        if (metodo === "POST")
          return respostaDe({
            ok: true,
            geradas: 0,
            falhas: ["theme-thumbs/x/a.jpg"],
            restantes: 8,
          });
        return respostaDe({ ok: true, linhas: [], fotos: 10, emFalta: 8, avisos: [] });
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as 8/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as 8/i }));

    await waitFor(() => expect(screen.getByText(/não deu/i)).toBeInTheDocument());
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(1);
  });
});

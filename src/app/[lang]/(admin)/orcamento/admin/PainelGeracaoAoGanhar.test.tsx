// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PainelGeracaoAoGanhar from "./PainelGeracaoAoGanhar";
import type { PreviaGeracaoDoEvento, ResultadoGeracaoDoEvento } from "@/lib/semear-producao";

/**
 * O painel que aparece ao marcar «Ganho»: uma prévia (sem escrever nada) e um
 * botão "Gerar" que só existe quando há alguma coisa por gerar.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const PREVIA: PreviaGeracaoDoEvento = {
  material: { linhas: 3, jaExiste: false },
  montagem: { linhas: 2 },
  calendario: { linhas: 4 },
  pagamentos: { linhas: 2 },
  haQualquerCoisaAGerar: true,
};

const RESULTADO: ResultadoGeracaoDoEvento = {
  material: { linhas: 3, preservadas: 0 },
  montagem: { linhas: 2 },
  calendario: { linhas: 4 },
  pagamentos: { linhas: 2 },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PainelGeracaoAoGanhar", () => {
  it("não renderiza nada quando o pedido não está 'aceite'", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "cotado" }} />);
    expect(container).toBeEmptyDOMElement();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pede a prévia ao montar, com { acao: 'prever' } — e não escreve nada", async () => {
    const chamadas: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        chamadas.push(JSON.parse(String(init.body)));
        return reply(200, PREVIA);
      }),
    );
    render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "aceite" }} />);
    await waitFor(() => expect(screen.getByTestId("previa-linhas")).toBeTruthy());
    expect(chamadas).toEqual([{ acao: "prever" }]);

    // Ordem: material, montagem, calendário, pagamentos — a mesma dos ROTULOS.
    const itens = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(itens[0]).toContain("Checklist de material");
    expect(itens[0]).toContain("3 linhas");
    expect(itens[1]).toContain("Plano de montagem");
    expect(itens[1]).toContain("2 linhas");
    expect(itens[2]).toContain("Datas-chave no calendário");
    expect(itens[2]).toContain("4 linhas");
    expect(itens[3]).toContain("Sinal e saldo");
    expect(itens[3]).toContain("2 linhas");
  });

  it("mostra 'nada a gerar' por artefacto quando a prévia já vem a zero", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, {
          material: { linhas: 0, jaExiste: true },
          montagem: { linhas: 0 },
          calendario: { linhas: 0 },
          pagamentos: { linhas: 0 },
          haQualquerCoisaAGerar: false,
        } satisfies PreviaGeracaoDoEvento),
      ),
    );
    render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "aceite" }} />);
    await waitFor(() =>
      expect(screen.getByText("Já está tudo gerado para este pedido.")).toBeTruthy(),
    );
    expect(screen.getAllByText("nada a gerar")).toHaveLength(4);
    expect(screen.queryByRole("button", { name: "Gerar" })).toBeNull();
  });

  it("'Gerar' chama a acção 'gerar' e mostra o resultado", async () => {
    const chamadas: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const corpo = JSON.parse(String(init.body));
        chamadas.push(corpo);
        return reply(200, corpo.acao === "prever" ? PREVIA : RESULTADO);
      }),
    );
    const user = userEvent.setup();
    const onGerado = vi.fn();
    render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "aceite" }} onGerado={onGerado} />);

    const botao = await screen.findByRole("button", { name: "Gerar" });
    await user.click(botao);

    await waitFor(() => expect(screen.getByTestId("resultado-geracao")).toBeTruthy());
    expect(chamadas).toEqual([{ acao: "prever" }, { acao: "gerar" }]);
    expect(screen.getByTestId("resultado-geracao").textContent).toContain("3 de material");
    expect(screen.getByTestId("resultado-geracao").textContent).toContain("4 datas-chave");
    expect(onGerado).toHaveBeenCalledWith(RESULTADO);
  });

  it("um erro na prévia mostra a mensagem e deixa tentar outra vez", async () => {
    let primeira = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (primeira) {
          primeira = false;
          return reply(500, { error: "O servidor não está a aceitar gravações" });
        }
        return reply(200, PREVIA);
      }),
    );
    const user = userEvent.setup();
    render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "aceite" }} />);

    await waitFor(() =>
      expect(screen.getByText("O servidor não está a aceitar gravações")).toBeTruthy(),
    );
    await user.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Gerar" })).toBeTruthy());
  });

  it("um pedido marcado como 'aceite' antes de o estar não faz nada (409 tratado como erro normal)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(409, { error: "O pedido ainda não está marcado como Ganho" })),
    );
    render(<PainelGeracaoAoGanhar quote={{ id: "Q1", status: "aceite" }} />);
    await waitFor(() =>
      expect(screen.getByText("O pedido ainda não está marcado como Ganho")).toBeTruthy(),
    );
  });
});

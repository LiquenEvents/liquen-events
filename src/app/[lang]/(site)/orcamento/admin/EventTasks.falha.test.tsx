// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventTasks from "./EventTasks";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "SEM TAREFAS LIGADAS A ESTE EVENTO" É A FRASE MAIS PERIGOSA DESTE PAINEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A leitura das tarefas do evento não olhava para a resposta: um 500, ou as
 * tabelas por instalar, caíam no mesmo `[]` de uma lista mesmo vazia, e o
 * painel dizia com toda a confiança que não havia nada para preparar. Ela abre
 * o evento na véspera da montagem, lê isso, e fecha o separador — com o que
 * falta fazer intacto do outro lado.
 *
 * É o mesmo padrão que a lista global de Tarefas e os Fornecedores já corrigiram
 * com o `AvisoDeFalha`: um estado vazio convida a começar, um estado de falha
 * tem de dizer o que se passou e dar o passo seguinte.
 */

/** O título do painel de falha — o `ToastProvider` também tem um role="alert",
 *  por isso identificamo-lo pelo que ele diz. */
const AVISO = /Não foi possível ler as tarefas deste evento/;

const QUOTE = { id: "LIQ-1", name: "Casamento Ana & Rui" } as unknown as Quote;

const resposta = (ok: boolean, body: unknown, status = ok ? 200 : 500) =>
  ({ ok, status, headers: new Headers(), json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(
    <ToastProvider>
      <EventTasks quote={QUOTE} />
    </ToastProvider>,
  );
}

describe("EventTasks — a leitura falhou", () => {
  it("uma leitura recusada não se disfarça de lista vazia", async () => {
    fetchMock.mockResolvedValue(resposta(false, { error: "Erro interno" }));
    montar();

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByText(/Sem tarefas ligadas a este evento/)).not.toBeInTheDocument();
  });

  it("uma quebra de rede também é dita, não engolida", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    montar();

    expect(await screen.findByText(AVISO)).toBeInTheDocument();
    expect(screen.queryByText(/Sem tarefas ligadas a este evento/)).not.toBeInTheDocument();
  });

  it("repete a explicação do servidor tal e qual — é ela que resolve o problema", async () => {
    fetchMock.mockResolvedValue(
      resposta(
        false,
        { error: "As tarefas ainda não existem: falta correr o db/schema.sql." },
        503,
      ),
    );
    montar();

    expect(await screen.findByText(/falta correr o db\/schema\.sql/)).toBeInTheDocument();
  });

  it("'Tentar de novo' volta a ler e mostra as tarefas quando o servidor responde", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(resposta(false, { error: "Erro interno" }));
    montar();

    const tentar = await screen.findByRole("button", { name: "Tentar de novo" });

    fetchMock.mockResolvedValueOnce(
      resposta(true, [
        {
          id: "t1",
          title: "Confirmar catering",
          done: false,
          priority: "alta",
          quoteId: "LIQ-1",
          createdAt: "2026-08-10T09:00:00.000Z",
        },
      ]),
    );
    await user.click(tentar);

    expect(await screen.findByText("Confirmar catering")).toBeInTheDocument();
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });

  it("uma lista mesmo vazia continua a convidar a criar a primeira tarefa", async () => {
    fetchMock.mockResolvedValue(resposta(true, []));
    montar();

    await waitFor(() =>
      expect(screen.getByText(/Sem tarefas ligadas a este evento/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(AVISO)).not.toBeInTheDocument();
  });
});
